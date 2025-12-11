import 'reflect-metadata'
import express from 'express'
import cors from 'cors'
import { RequestContext } from '@mikro-orm/postgresql'
import { userMiddleware } from '@/middleware/userMiddleware'
import { health } from '@/api/health'
import { requireAuth } from '@/middleware/authMiddleware'
import { initDI } from '@/di'
import { Request, Response, NextFunction } from 'express'
import { userRouter } from '@/api/user'
import { transferencistaRouter } from '@/api/transferencista'
import { minoristaRouter } from '@/api/minorista'
import { minoristaTransactionRouter } from '@/api/minoristaTransaction'
import { giroRouter } from '@/api/giro'
import { bankAssignmentRouter } from '@/api/bankAssignment'
import { bankRouter } from '@/api/bank'
import { bankAccountRouter } from '@/api/bankAccount'
import { bankTransactionRouter } from '@/api/bankTransaction'
import { exchangeRateRouter } from '@/api/exchangeRate'
import dashboardRouter from '@/api/dashboard'
import reportsRouter from '@/api/reports'
import rechargeOperatorRouter from '@/api/rechargeOperator'
import rechargeAmountRouter from '@/api/rechargeAmount'
import operatorAmountRouter from '@/api/operatorAmount'
import cookieParser from 'cookie-parser'
import { IS_DEVELOPMENT, ENABLE_SECURITY_SETTINGS, EXPRESS_SERVER_PORT, corsOptions } from '@/settings'
import { emailVerificationRouter } from '@/api/emailVerification'
import { generalRateLimiter } from '@/middleware/rateLimitMiddleware'
import { logger } from '@/lib/logger'
import { posthog } from '@/lib/posthogUtils'
import * as Sentry from '@sentry/node'
import { ApiResponse } from '@/lib/apiResponse'
import { notificationRouter } from './api/notification'
import { beneficiarySuggestionRouter } from '@/api/beneficiarySuggestion'

import { Server as SocketIOServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import http from 'http'
import { GiroSocketManager, setGiroSocketManager } from '@/websocket'

export const startExpressServer = async () => {
  // DI stands for Dependency Injection. the naming/acronym is a bit confusing, but we're using it
  // because it's the established patter used by mikro-orm, and we want to be able to easily find information
  // about our setup online. see e.g. https://github.com/mikro-orm/express-ts-example-app/blob/master/app/server.ts
  const DI = await initDI()

  const app = express()

  // Trust Fly.io proxy for accurate client IP detection in rate limiting
  app.set('trust proxy', 'loopback')

  const route404 = (req: Request, res: Response) => {
    res.status(404).json(ApiResponse.notFound())
  }

  if (ENABLE_SECURITY_SETTINGS) {
    app.use(generalRateLimiter)
  }

  app.use(cors(corsOptions))

  app.use(express.json())
  app.use((req, res, next) => {
    logger.info(`[REQ] ${req.method} ${req.url} desde ${req.headers.origin}`)
    next()
  })

  app.use(cookieParser())
  app.use((req, res, next) => RequestContext.create(DI.orm.em, next))
  app.use(userMiddleware())

  // Routers
  const privateRoutesRouter = express.Router({ mergeParams: true })

  privateRoutesRouter.use(requireAuth())

  app.get('/health', health)
  app.use('/user', userRouter)
  app.use('/transferencista', transferencistaRouter)
  app.use('/minorista', minoristaRouter)
  app.use('/minorista-transaction', minoristaTransactionRouter)
  app.use('/bank', bankRouter)
  app.use('/bank-assignment', bankAssignmentRouter)
  app.use('/bank-account', bankAccountRouter)
  app.use('/bank-transaction', bankTransactionRouter)
  app.use('/exchange-rate', exchangeRateRouter)
  app.use('/email_verification', emailVerificationRouter)
  app.use('/reports', reportsRouter)
  app.use('/recharge-operators', rechargeOperatorRouter)
  app.use('/recharge-amounts', rechargeAmountRouter)
  app.use('/operator-amounts', operatorAmountRouter)
  app.use('/notifications', notificationRouter)
  app.use('/beneficiary-suggestion', beneficiarySuggestionRouter)

  // Rutas privadas (requieren autenticación)
  privateRoutesRouter.use('/giro', giroRouter)
  privateRoutesRouter.use('/dashboard', dashboardRouter)

  app.use('/', privateRoutesRouter)

  app.use(route404)

  // the error handler must be registered before any other error middleware and after all controllers
  Sentry.setupExpressErrorHandler(app)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(function onError(err: unknown, req: Request, res: Response, next: NextFunction) {
    if (IS_DEVELOPMENT) {
      return res.status(500).json(ApiResponse.serverError(String(err)))
    }

    res.statusCode = 503
    // res.sentry is the sentry error id and the client can use this when reporting the error to support.
    res.json(ApiResponse.serviceUnavailable(undefined, res.sentry))
  })

  const HOST = '0.0.0.0'

  // Crear servidor HTTP que será usado por Express y Socket.IO
  const httpServer = http.createServer(app)

  // Configurar Socket.IO con Redis adapter para clustering
  const io = new SocketIOServer(httpServer, {
    cors: corsOptions,
    transports: ['websocket', 'polling'],
  })

  // Configurar Redis adapter para sincronizar WebSockets entre procesos PM2
  try {
    const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
    const subClient = pubClient.duplicate()

    await Promise.all([pubClient.connect(), subClient.connect()])

    io.adapter(createAdapter(pubClient, subClient))
    logger.info('[REDIS] ✅ Redis adapter configurado para Socket.IO clustering')
  } catch (error) {
    logger.error({ error }, '[REDIS] ❌ Error configurando Redis adapter, WebSockets funcionarán solo en proceso único')
    // Continuar sin Redis adapter si falla (funcionará en desarrollo local)
  }

  // Log para verificar que Socket.IO está funcionando
  io.on('connection', (socket) => {
    console.log(`[SOCKET.IO] ✅ Nueva conexión de cliente - Socket ID: ${socket.id}`)
  })

  // Inicializar GiroSocketManager
  const giroSocketManager = new GiroSocketManager(io)
  setGiroSocketManager(giroSocketManager)

  DI.server = httpServer.listen(EXPRESS_SERVER_PORT, HOST, (err?: Error) => {
    if (err) {
      logger.error({ error: err }, `Could not start Express server on http://${HOST}:${EXPRESS_SERVER_PORT}`)
      gracefulShutdown('listen-error', 1)
      return
    }
    logger.info(`Express server started at http://${HOST}:${EXPRESS_SERVER_PORT}`)
    logger.info(`Socket.IO listening on http://${HOST}:${EXPRESS_SERVER_PORT}`)
  })

  const closeServer = (): Promise<void> =>
    new Promise((resolve, reject) => {
      DI.server.close((err) => (err ? reject(err) : resolve()))
    })

  const gracefulShutdown = async (signal: string, exitCode = 0) => {
    logger.info(`${signal} received, starting graceful shutdown...`)

    const timer = setTimeout(() => {
      logger.error('Forced shutdown after timeout')
      process.exit(1)
    }, 30000).unref()

    try {
      if (DI.server.listening) {
        await closeServer()
        // drop any idle keep alive connections immediately on Node >=18 <19
        DI.server.closeIdleConnections()
        logger.info('HTTP server closed')
      } else {
        logger.info('HTTP server was not listening; skipping server.close()')
      }

      try {
        await posthog.shutdown()
        logger.info('PostHog client shut down')
      } catch (error) {
        logger.error({ error }, 'Error shutting down PostHog')
      }

      try {
        await DI.orm.close()
        logger.info('Database connection closed')
      } catch (error) {
        logger.error({ error }, 'Error closing database connection')
      }

      clearTimeout(timer)
      logger.info('Graceful shutdown complete')
      process.exit(exitCode)
    } catch (error) {
      logger.error({ error }, 'Error during graceful shutdown')
      clearTimeout(timer)
      process.exit(1)
    }
  }

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.once('SIGINT', () => gracefulShutdown('SIGINT'))
}

import 'reflect-metadata'
import { initDI } from '@/di'
import { createApp } from '@/app'
import { EXPRESS_SERVER_PORT, corsOptions } from '@/settings'
import { logger } from '@/lib/logger'
import { posthog } from '@/lib/posthogUtils'
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

  const app = createApp(DI)

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
    pubClient.on('error', (err) => logger.error({ err }, 'Redis pubClient Error'))
    const subClient = pubClient.duplicate()
    subClient.on('error', (err) => logger.error({ err }, 'Redis subClient Error'))

    await Promise.all([pubClient.connect(), subClient.connect()])

    io.adapter(createAdapter(pubClient, subClient))
    logger.info('[REDIS] ✅ Redis adapter configurado para Socket.IO clustering')
  } catch (error) {
    logger.error({ error }, '[REDIS] ❌ Error configurando Redis adapter, WebSockets funcionarán solo en proceso único')
    // Continuar sin Redis adapter si falla (funcionará en desarrollo local)
  }

  // Log para verificar que Socket.IO está funcionando
  io.on('connection', (socket) => {
    logger.info(`[SOCKET.IO] ✅ Nueva conexión de cliente - Socket ID: ${socket.id}`)
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

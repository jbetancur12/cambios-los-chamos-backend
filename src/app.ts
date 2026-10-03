import 'reflect-metadata'
import express from 'express'
import cors from 'cors'
import { RequestContext } from '@mikro-orm/postgresql'
import { UserRole } from '@/entities/User'
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
import { IS_DEVELOPMENT, ENABLE_SECURITY_SETTINGS, corsOptions } from '@/settings'
import { emailVerificationRouter } from '@/api/emailVerification'
import { generalRateLimiter } from '@/middleware/rateLimitMiddleware'
import { logger } from '@/lib/logger'
import { posthog } from '@/lib/posthogUtils'
import * as Sentry from '@sentry/node'
import { ApiResponse } from '@/lib/apiResponse'
import { notificationRouter } from './api/notification'
import { beneficiarySuggestionRouter } from '@/api/beneficiarySuggestion'
import { auditRouter } from '@/api/audit'
import { logsRouter } from '@/api/logs'
import { invoiceClientesRouter } from '@/api/invoiceClientes'
import { inventoryRouter } from '@/api/inventory'
import { whatsappWebhookRouter } from '@/api/whatsappWebhook'
import { cobranzasRouter } from '@/api/cobranzas'


// Builds the Express app with all middleware and routes. Kept separate from startExpressServer
// (which also wires Redis, Socket.IO and the listener) so tests can exercise the HTTP layer alone.
export const createApp = (DI: Awaited<ReturnType<typeof initDI>>) => {
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
    logger.info(`[REQ] ${req.method} ${req.url} desde ${req.headers.origin || req.headers.referer || 'unknown'}`)
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
  app.use('/audit-transactions', auditRouter)
  app.use('/invoice-clientes', invoiceClientesRouter)

  // Rutas privadas (requieren autenticación)
  privateRoutesRouter.use('/giro', giroRouter)
  privateRoutesRouter.use('/dashboard', dashboardRouter)
  app.use('/logs', logsRouter)
  app.use('/inventory', inventoryRouter)
  app.use('/whatsapp', whatsappWebhookRouter)
  app.use('/cobranzas', cobranzasRouter)

  app.use('/', privateRoutesRouter)

  app.use(route404)

  // the error handler must be registered before any other error middleware and after all controllers
  Sentry.setupExpressErrorHandler(app)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(function onError(err: unknown, req: Request, res: Response, next: NextFunction) {
    // Track error in PostHog if user is SuperAdmin
    // userMiddleware puts user in req.context.requestUser.user
    // But we need to be careful about types or access it safely
    // Casting to any to access context safely since Request type might not have it strictly defined here without augmentation import
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (req as any).context?.requestUser?.user

    if (user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN)) {
      posthog.captureException(err as Error, user.id, {
        path: req.originalUrl || req.url,
        method: req.method,
        email: user.email,
        requestId: (req as any).id,
      })
    }

    if (IS_DEVELOPMENT) {
      return res.status(500).json(ApiResponse.serverError(String(err)))
    }

    res.statusCode = 503
    // res.sentry is the sentry error id and the client can use this when reporting the error to support.
    res.json(ApiResponse.serviceUnavailable(undefined, res.sentry))
  })

  return app
}

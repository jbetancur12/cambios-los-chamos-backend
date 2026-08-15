import express, { Request, Response } from 'express'
import { requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { UserRole } from '@/entities/User'
import { CreditStatus, CreditFrequency } from '@/entities/Credit'
import { PaymentStatus, PaymentMethod } from '@/entities/Payment'
import { CashBalanceStatus } from '@/entities/CashBalance'
import {
  createCobranzaClientSchema,
  updateCobranzaClientSchema,
  createClientCategorySchema,
  updateClientCategorySchema,
  createInterestRateSchema,
  updateInterestRateSchema,
  updateLoanFrequencySchema,
  createLoanFrequencySchema,
  createCobranzaRouteSchema,
  updateCobranzaRouteSchema,
  assignClientsToRouteSchema,
  createCreditSchema,
  updateCreditSchema,
  approveCreditSchema,
  rejectCreditSchema,
  deliverCreditSchema,
  rescheduleCreditSchema,
  registerPaymentSchema,
  openCashBalanceSchema,
  closeCashBalanceSchema,
} from '@/schemas/cobranzasSchemas'
import { cobranzaClientService } from '@/services/cobranzas/CobranzaClientService'
import { clientCategoryService } from '@/services/cobranzas/ClientCategoryService'
import { interestRateService } from '@/services/cobranzas/InterestRateService'
import { loanFrequencyService } from '@/services/cobranzas/LoanFrequencyService'
import { cobranzaRouteService } from '@/services/cobranzas/CobranzaRouteService'
import { creditService } from '@/services/cobranzas/CreditService'
import { paymentService } from '@/services/cobranzas/PaymentService'
import { cashBalanceService } from '@/services/cobranzas/CashBalanceService'
import { cobranzasDashboardService } from '@/services/cobranzas/CobranzasDashboardService'
import { logger } from '@/lib/logger'
import { DI } from '@/di'

export const cobranzasRouter = express.Router()

const requireSuperAdmin = requireRole(UserRole.SUPER_ADMIN)

// ============================================================================
// Dashboard
// ============================================================================
cobranzasRouter.get('/dashboard/stats', requireSuperAdmin, async (_req: Request, res: Response) => {
  const stats = await cobranzasDashboardService.getStats()
  res.json(ApiResponse.success({ stats }))
})

cobranzasRouter.get('/dashboard/recent-activity', requireSuperAdmin, async (_req: Request, res: Response) => {
  const activity = await cobranzasDashboardService.getRecentActivity()
  res.json(ApiResponse.success({ activity }))
})

cobranzasRouter.get('/dashboard/financial-summary', requireSuperAdmin, async (_req: Request, res: Response) => {
  const summary = await cobranzasDashboardService.getFinancialSummary()
  res.json(ApiResponse.success({ summary }))
})

cobranzasRouter.get('/dashboard/portfolio-report', requireSuperAdmin, async (_req: Request, res: Response) => {
  const report = await cobranzasDashboardService.getPortfolioReport()
  res.json(ApiResponse.success({ report }))
})

// ============================================================================
// Clientes
// ============================================================================
cobranzasRouter.get('/clients', requireSuperAdmin, async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  const activeOnly = req.query.activeOnly === 'true'
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined
  const page = req.query.page ? Number(req.query.page) : undefined
  const limit = req.query.limit ? Number(req.query.limit) : undefined

  const result = await cobranzaClientService.list({ search, activeOnly, categoryId, page, limit })
  res.json(ApiResponse.success(result))
})

cobranzasRouter.get('/clients/stats', requireSuperAdmin, async (_req: Request, res: Response) => {
  const stats = await cobranzaClientService.getStats()
  res.json(ApiResponse.success({ stats }))
})

cobranzasRouter.get('/clients/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const client = await cobranzaClientService.getById(req.params.id)
  if (!client) {
    return res.status(404).json(ApiResponse.notFound('Cliente', req.params.id))
  }
  const activeCredits = await cobranzaClientService.getActiveCredits(client.id)
  const paymentHistory = await cobranzaClientService.getPaymentHistory(client.id)
  res.json(ApiResponse.success({ client, activeCredits, paymentHistory }))
})

cobranzasRouter.post(
  '/clients',
  requireSuperAdmin,
  validateBody(createCobranzaClientSchema),
  async (req: Request, res: Response) => {
    const result = await cobranzaClientService.create(req.body)

    if ('error' in result) {
      if (result.error === 'DUPLICATE_IDENTIFICATION') {
        return res.status(409).json(ApiResponse.conflict('Ya existe un cliente con esa cédula'))
      }
      return res.status(404).json(ApiResponse.notFound('Categoría'))
    }

    res.status(201).json(ApiResponse.success({ client: result, message: 'Cliente creado exitosamente' }))
  }
)

cobranzasRouter.patch(
  '/clients/:id',
  requireSuperAdmin,
  validateBody(updateCobranzaClientSchema),
  async (req: Request, res: Response) => {
    const result = await cobranzaClientService.update(req.params.id, req.body)

    if ('error' in result) {
      switch (result.error) {
        case 'CLIENT_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Cliente', req.params.id))
        case 'DUPLICATE_IDENTIFICATION':
          return res.status(409).json(ApiResponse.conflict('Ya existe un cliente con esa cédula'))
        default:
          return res.status(404).json(ApiResponse.notFound('Categoría'))
      }
    }

    res.json(ApiResponse.success({ client: result, message: 'Cliente actualizado exitosamente' }))
  }
)

cobranzasRouter.patch('/clients/:id/toggle-active', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cobranzaClientService.toggleActive(req.params.id)
  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Cliente', req.params.id))
  }
  res.json(
    ApiResponse.success({
      client: result,
      message: `Cliente ${result.isActive ? 'activado' : 'desactivado'} exitosamente`,
    })
  )
})

cobranzasRouter.delete('/clients/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cobranzaClientService.remove(req.params.id)
  if (typeof result === 'object' && result !== null && 'error' in result) {
    if (result.error === 'HAS_CREDITS') {
      return res.status(409).json(ApiResponse.conflict('El cliente tiene créditos activos'))
    }
    return res.status(404).json(ApiResponse.notFound('Cliente', req.params.id))
  }
  res.json(ApiResponse.success({ message: 'Cliente eliminado exitosamente' }))
})

// ============================================================================
// Categorías de clientes
// ============================================================================
cobranzasRouter.get('/categories', requireSuperAdmin, async (req: Request, res: Response) => {
  const categories = await clientCategoryService.list(req.query.activeOnly === 'true')
  res.json(ApiResponse.success({ categories }))
})

cobranzasRouter.get('/categories/statistics', requireSuperAdmin, async (_req: Request, res: Response) => {
  const stats = await clientCategoryService.getStatistics()
  res.json(ApiResponse.success({ stats }))
})

cobranzasRouter.post(
  '/categories',
  requireSuperAdmin,
  validateBody(createClientCategorySchema),
  async (req: Request, res: Response) => {
    const result = await clientCategoryService.create(req.body)
    if ('error' in result) {
      return res.status(409).json(ApiResponse.conflict('Ya existe una categoría con ese código'))
    }
    res.status(201).json(ApiResponse.success({ category: result, message: 'Categoría creada exitosamente' }))
  }
)

cobranzasRouter.patch(
  '/categories/:id',
  requireSuperAdmin,
  validateBody(updateClientCategorySchema),
  async (req: Request, res: Response) => {
    const result = await clientCategoryService.update(req.params.id, req.body)
    if ('error' in result) {
      if (result.error === 'DUPLICATE_CODE') {
        return res.status(409).json(ApiResponse.conflict('Ya existe una categoría con ese código'))
      }
      return res.status(404).json(ApiResponse.notFound('Categoría', req.params.id))
    }
    res.json(ApiResponse.success({ category: result, message: 'Categoría actualizada exitosamente' }))
  }
)

cobranzasRouter.patch('/categories/:id/toggle-active', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await clientCategoryService.toggleActive(req.params.id)
  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Categoría', req.params.id))
  }
  res.json(
    ApiResponse.success({
      category: result,
      message: `Categoría ${result.isActive ? 'activada' : 'desactivada'} exitosamente`,
    })
  )
})

cobranzasRouter.delete('/categories/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await clientCategoryService.remove(req.params.id)
  if (typeof result === 'object' && result !== null && 'error' in result) {
    if (result.error === 'IN_USE') {
      return res.status(409).json(ApiResponse.conflict('La categoría tiene clientes asignados'))
    }
    return res.status(404).json(ApiResponse.notFound('Categoría', req.params.id))
  }
  res.json(ApiResponse.success({ message: 'Categoría eliminada exitosamente' }))
})

// ============================================================================
// Tasas de interés
// ============================================================================
cobranzasRouter.get('/interest-rates', requireSuperAdmin, async (req: Request, res: Response) => {
  const rates = await interestRateService.list(req.query.activeOnly === 'true')
  res.json(ApiResponse.success({ rates }))
})

cobranzasRouter.get('/interest-rates/active', requireSuperAdmin, async (_req: Request, res: Response) => {
  const rates = await interestRateService.list(true)
  res.json(ApiResponse.success({ rates }))
})

cobranzasRouter.post(
  '/interest-rates',
  requireSuperAdmin,
  validateBody(createInterestRateSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const rate = await interestRateService.create(req.body, userId)
    res.status(201).json(ApiResponse.success({ rate, message: 'Tasa de interés creada exitosamente' }))
  }
)

cobranzasRouter.patch(
  '/interest-rates/:id',
  requireSuperAdmin,
  validateBody(updateInterestRateSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await interestRateService.update(req.params.id, req.body, userId)
    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Tasa de interés', req.params.id))
    }
    res.json(ApiResponse.success({ rate: result, message: 'Tasa actualizada exitosamente' }))
  }
)

cobranzasRouter.patch('/interest-rates/:id/toggle-active', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await interestRateService.toggleActive(req.params.id)
  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Tasa de interés', req.params.id))
  }
  res.json(
    ApiResponse.success({
      rate: result,
      message: `Tasa ${result.isActive ? 'activada' : 'desactivada'} exitosamente`,
    })
  )
})

cobranzasRouter.delete('/interest-rates/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await interestRateService.remove(req.params.id)
  if (typeof result === 'object' && result !== null && 'error' in result) {
    return res.status(404).json(ApiResponse.notFound('Tasa de interés', req.params.id))
  }
  res.json(ApiResponse.success({ message: 'Tasa eliminada exitosamente' }))
})

// ============================================================================
// Frecuencias de pago
// ============================================================================
cobranzasRouter.get('/loan-frequencies', requireSuperAdmin, async (req: Request, res: Response) => {
  const frequencies = await loanFrequencyService.list(req.query.enabledOnly !== 'false')
  res.json(ApiResponse.success({ frequencies }))
})

cobranzasRouter.get('/loan-frequencies/:code', requireSuperAdmin, async (req: Request, res: Response) => {
  const freq = await loanFrequencyService.getByCode(req.params.code)
  if (!freq) {
    return res.status(404).json(ApiResponse.notFound('Frecuencia', req.params.code))
  }
  res.json(ApiResponse.success({ frequency: freq }))
})

cobranzasRouter.post(
  '/loan-frequencies',
  requireSuperAdmin,
  validateBody(createLoanFrequencySchema),
  async (req: Request, res: Response) => {
    const result = await loanFrequencyService.create(req.body)
    if ('error' in result) {
      return res.status(409).json(ApiResponse.conflict('Ya existe una frecuencia con ese código'))
    }
    res.status(201).json(ApiResponse.success({ frequency: result, message: 'Frecuencia creada exitosamente' }))
  }
)

cobranzasRouter.patch(
  '/loan-frequencies/:id',
  requireSuperAdmin,
  validateBody(updateLoanFrequencySchema),
  async (req: Request, res: Response) => {
    const result = await loanFrequencyService.update(req.params.id, req.body)
    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Frecuencia', req.params.id))
    }
    res.json(ApiResponse.success({ frequency: result, message: 'Frecuencia actualizada exitosamente' }))
  }
)

// ============================================================================
// Rutas de cobranza
// ============================================================================
cobranzasRouter.get('/routes', requireSuperAdmin, async (_req: Request, res: Response) => {
  const routes = await cobranzaRouteService.list()
  res.json(ApiResponse.success({ routes }))
})

cobranzasRouter.get('/routes/available-clients', requireSuperAdmin, async (_req: Request, res: Response) => {
  const clients = await cobranzaRouteService.getAvailableClients()
  res.json(ApiResponse.success({ clients }))
})

cobranzasRouter.get('/routes/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const route = await cobranzaRouteService.getById(req.params.id)
  if (!route) {
    return res.status(404).json(ApiResponse.notFound('Ruta', req.params.id))
  }
  res.json(ApiResponse.success({ route }))
})

cobranzasRouter.post(
  '/routes',
  requireSuperAdmin,
  validateBody(createCobranzaRouteSchema),
  async (req: Request, res: Response) => {
    const result = await cobranzaRouteService.create(req.body)
    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Cobrador'))
    }
    res.status(201).json(ApiResponse.success({ route: result, message: 'Ruta creada exitosamente' }))
  }
)

cobranzasRouter.patch(
  '/routes/:id',
  requireSuperAdmin,
  validateBody(updateCobranzaRouteSchema),
  async (req: Request, res: Response) => {
    const result = await cobranzaRouteService.update(req.params.id, req.body)
    if ('error' in result) {
      if (result.error === 'COBRADOR_NOT_FOUND') {
        return res.status(404).json(ApiResponse.notFound('Cobrador'))
      }
      return res.status(404).json(ApiResponse.notFound('Ruta', req.params.id))
    }
    res.json(ApiResponse.success({ route: result, message: 'Ruta actualizada exitosamente' }))
  }
)

cobranzasRouter.post(
  '/routes/:id/clients',
  requireSuperAdmin,
  validateBody(assignClientsToRouteSchema),
  async (req: Request, res: Response) => {
    const result = await cobranzaRouteService.assignClients(req.params.id, req.body.clientIds)
    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Ruta', req.params.id))
    }
    res.json(ApiResponse.success({ route: result, message: 'Clientes asignados a la ruta' }))
  }
)

cobranzasRouter.delete('/routes/:id/clients/:clientId', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cobranzaRouteService.removeClient(req.params.id, req.params.clientId)
  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Ruta', req.params.id))
  }
  res.json(ApiResponse.success({ route: result, message: 'Cliente removido de la ruta' }))
})

cobranzasRouter.delete('/routes/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cobranzaRouteService.remove(req.params.id)
  if (typeof result === 'object' && result !== null && 'error' in result) {
    return res.status(404).json(ApiResponse.notFound('Ruta', req.params.id))
  }
  res.json(ApiResponse.success({ message: 'Ruta eliminada exitosamente' }))
})

// ============================================================================
// Créditos
// ============================================================================
cobranzasRouter.get('/credits', requireSuperAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? (req.query.status as CreditStatus) : undefined
  const frequency = typeof req.query.frequency === 'string' ? (req.query.frequency as CreditFrequency) : undefined
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  const requiringAttention = req.query.requiringAttention === 'true'
  const page = req.query.page ? Number(req.query.page) : undefined
  const limit = req.query.limit ? Number(req.query.limit) : undefined

  const result = await creditService.listCredits({
    status,
    frequency,
    clientId,
    search,
    requiringAttention,
    page,
    limit,
  })
  res.json(ApiResponse.success(result))
})

cobranzasRouter.get('/credits/counts', requireSuperAdmin, async (_req: Request, res: Response) => {
  const counts: Record<string, number> = {}
  for (const status of Object.values(CreditStatus)) {
    counts[status] = await DI.credits.count({ status })
  }
  res.json(ApiResponse.success({ counts }))
})

cobranzasRouter.get('/credits/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await creditService.getCreditDetail(req.params.id)
  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Crédito', req.params.id))
  }
  res.json(ApiResponse.success(result))
})

cobranzasRouter.get('/credits/:id/schedule', requireSuperAdmin, async (req: Request, res: Response) => {
  const detail = await creditService.getCreditDetail(req.params.id)
  if ('error' in detail) {
    return res.status(404).json(ApiResponse.notFound('Crédito', req.params.id))
  }
  res.json(ApiResponse.success({ schedule: detail.schedule }))
})

cobranzasRouter.post(
  '/credits',
  requireSuperAdmin,
  validateBody(createCreditSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await creditService.createCredit(req.body, userId)
    if ('error' in result) {
      const messages: Record<string, string> = {
        CLIENT_NOT_FOUND: 'Cliente no encontrado',
        CLIENT_INACTIVE: 'El cliente está inactivo',
        FREQUENCY_DISABLED: 'La frecuencia de pago no está habilitada',
      }
      return res.status(400).json(ApiResponse.error(messages[result.error] ?? 'Error al crear el crédito'))
    }
    res.status(201).json(ApiResponse.success({ credit: result, message: 'Crédito creado exitosamente' }))
  }
)

cobranzasRouter.patch(
  '/credits/:id',
  requireSuperAdmin,
  validateBody(updateCreditSchema),
  async (req: Request, res: Response) => {
    const result = await creditService.updateCredit(req.params.id, req.body)
    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Crédito', req.params.id))
    }
    res.json(ApiResponse.success({ credit: result, message: 'Crédito actualizado exitosamente' }))
  }
)

cobranzasRouter.post(
  '/credits/:id/approve',
  requireSuperAdmin,
  validateBody(approveCreditSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await creditService.approveForDelivery(
      req.params.id,
      userId,
      req.body.scheduledDeliveryDate,
      req.body.notes
    )
    if ('error' in result) {
      if (result.error === 'INVALID_STATUS') {
        return res.status(409).json(ApiResponse.conflict('El crédito no está en estado pendiente de aprobación'))
      }
      return res.status(404).json(ApiResponse.notFound('Crédito', req.params.id))
    }
    res.json(ApiResponse.success({ credit: result, message: 'Crédito aprobado. En espera de entrega.' }))
  }
)

cobranzasRouter.post(
  '/credits/:id/reject',
  requireSuperAdmin,
  validateBody(rejectCreditSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await creditService.reject(req.params.id, userId, req.body.reason)
    if ('error' in result) {
      if (result.error === 'INVALID_STATUS') {
        return res.status(409).json(ApiResponse.conflict('El crédito no puede ser rechazado en su estado actual'))
      }
      return res.status(404).json(ApiResponse.notFound('Crédito', req.params.id))
    }
    res.json(ApiResponse.success({ credit: result, message: 'Crédito rechazado' }))
  }
)

cobranzasRouter.post(
  '/credits/:id/deliver',
  requireSuperAdmin,
  validateBody(deliverCreditSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await creditService.deliverToClient(
      req.params.id,
      userId,
      req.body.notes,
      req.body.firstPaymentToday
    )
    if ('error' in result) {
      if (result.error === 'INVALID_STATUS') {
        return res.status(409).json(ApiResponse.conflict('El crédito no está en espera de entrega'))
      }
      return res.status(404).json(ApiResponse.notFound('Crédito', req.params.id))
    }
    res.json(ApiResponse.success({ credit: result, message: 'Crédito entregado y activado' }))
  }
)

cobranzasRouter.post(
  '/credits/:id/reschedule',
  requireSuperAdmin,
  validateBody(rescheduleCreditSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await creditService.rescheduleDelivery(
      req.params.id,
      req.body.scheduledDeliveryDate,
      userId,
      req.body.reason
    )
    if ('error' in result) {
      if (result.error === 'INVALID_STATUS') {
        return res.status(409).json(ApiResponse.conflict('El crédito no está en espera de entrega'))
      }
      return res.status(404).json(ApiResponse.notFound('Crédito', req.params.id))
    }
    res.json(ApiResponse.success({ credit: result, message: 'Entrega reprogramada exitosamente' }))
  }
)

// ============================================================================
// Pagos
// ============================================================================
cobranzasRouter.get('/payments', requireSuperAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? (req.query.status as PaymentStatus) : undefined
  const paymentMethod =
    typeof req.query.paymentMethod === 'string' ? (req.query.paymentMethod as PaymentMethod) : undefined
  const creditId = typeof req.query.creditId === 'string' ? req.query.creditId : undefined
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined
  const from = typeof req.query.from === 'string' ? req.query.from : undefined
  const to = typeof req.query.to === 'string' ? req.query.to : undefined
  const page = req.query.page ? Number(req.query.page) : undefined
  const limit = req.query.limit ? Number(req.query.limit) : undefined

  const result = await paymentService.list({ status, paymentMethod, creditId, clientId, from, to, page, limit })
  res.json(ApiResponse.success(result))
})

cobranzasRouter.get('/payments/recent', requireSuperAdmin, async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20
  const payments = await paymentService.getRecent(limit)
  res.json(ApiResponse.success({ payments }))
})

cobranzasRouter.get('/payments/:id/receipt', requireSuperAdmin, async (req: Request, res: Response) => {
  const payment = await DI.payments.findOne(
    { id: req.params.id },
    { populate: ['client', 'credit', 'credit.client', 'receivedBy'] }
  )
  if (!payment) {
    return res.status(404).json(ApiResponse.notFound('Pago', req.params.id))
  }
  const receiptNumber = `R-${payment.id.slice(0, 8).toUpperCase()}`
  res.json(
    ApiResponse.success({
      payment,
      receiptNumber,
      businessName: 'Inversiones R&M',
    })
  )
})

cobranzasRouter.get('/payments/today-summary', requireSuperAdmin, async (_req: Request, res: Response) => {
  const summary = await paymentService.getTodaySummary()
  res.json(ApiResponse.success({ summary }))
})

cobranzasRouter.get('/payments/credit/:creditId', requireSuperAdmin, async (req: Request, res: Response) => {
  const payments = await paymentService.getByCredit(req.params.creditId)
  res.json(ApiResponse.success({ payments }))
})

cobranzasRouter.post(
  '/payments',
  requireSuperAdmin,
  validateBody(registerPaymentSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await paymentService.registerPayment(req.body, userId)
    if ('error' in result) {
      switch (result.error) {
        case 'CREDIT_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Crédito'))
        case 'CREDIT_CLOSED':
          return res.status(409).json(ApiResponse.conflict('El crédito ya está saldado o cancelado'))
        case 'CASH_BALANCE_NOT_OPEN':
          return res.status(409).json(ApiResponse.conflict('La caja indicada no está abierta'))
      }
    }
    res.status(201).json(ApiResponse.success({ payment: result.payment, credit: result.credit, result: result.result }))
  }
)

cobranzasRouter.delete('/payments/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const userId = req.context?.requestUser?.user?.id
  if (!userId) {
    return res.status(401).json(ApiResponse.unauthorized())
  }
  const result = await paymentService.remove(req.params.id, userId)
  if (typeof result === 'object' && result !== null && 'error' in result) {
    return res.status(404).json(ApiResponse.notFound('Pago', req.params.id))
  }
  res.json(ApiResponse.success({ message: 'Pago cancelado' }))
})

// ============================================================================
// Caja (balanzas de efectivo)
// ============================================================================
cobranzasRouter.get('/cash-balances', requireSuperAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? (req.query.status as CashBalanceStatus) : undefined
  const from = typeof req.query.from === 'string' ? req.query.from : undefined
  const to = typeof req.query.to === 'string' ? req.query.to : undefined
  const page = req.query.page ? Number(req.query.page) : undefined
  const limit = req.query.limit ? Number(req.query.limit) : undefined

  const result = await cashBalanceService.list({ status, from, to, page, limit })
  res.json(ApiResponse.success(result))
})

cobranzasRouter.get('/cash-balances/current-status', requireSuperAdmin, async (req: Request, res: Response) => {
  const userId = req.context?.requestUser?.user?.id
  if (!userId) {
    return res.status(401).json(ApiResponse.unauthorized())
  }
  const balance = await cashBalanceService.getCurrentStatus(userId)
  res.json(ApiResponse.success({ balance }))
})

cobranzasRouter.get('/cash-balances/pending-closures', requireSuperAdmin, async (_req: Request, res: Response) => {
  const balances = await cashBalanceService.getPendingClosures()
  res.json(ApiResponse.success({ balances }))
})

cobranzasRouter.post(
  '/cash-balances/open',
  requireSuperAdmin,
  validateBody(openCashBalanceSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await cashBalanceService.open(userId, req.body)
    if ('error' in result) {
      return res.status(409).json(ApiResponse.conflict('Ya existe una caja abierta para hoy'))
    }
    res.status(201).json(ApiResponse.success({ balance: result, message: 'Caja abierta exitosamente' }))
  }
)

cobranzasRouter.post('/cash-balances/:id/auto-calculate', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cashBalanceService.autoCalculateCollected(req.params.id)
  if ('error' in result) {
    if (result.error === 'BALANCE_CLOSED') {
      return res.status(409).json(ApiResponse.conflict('La caja ya está cerrada'))
    }
    return res.status(404).json(ApiResponse.notFound('Caja', req.params.id))
  }
  res.json(ApiResponse.success({ balance: result, message: 'Recaudo calculado automáticamente' }))
})

cobranzasRouter.get('/cash-balances/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const balance = await cashBalanceService.getById(req.params.id)
  if (!balance) {
    return res.status(404).json(ApiResponse.notFound('Caja', req.params.id))
  }
  res.json(ApiResponse.success({ balance }))
})

cobranzasRouter.get('/cash-balances/:id/detailed', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cashBalanceService.getDetailedBalance(req.params.id)
  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Caja', req.params.id))
  }
  res.json(ApiResponse.success(result))
})

cobranzasRouter.post(
  '/cash-balances/:id/close',
  requireSuperAdmin,
  validateBody(closeCashBalanceSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await cashBalanceService.close(req.params.id, userId, req.body)
    if ('error' in result) {
      if (result.error === 'BALANCE_CLOSED') {
        return res.status(409).json(ApiResponse.conflict('La caja ya está cerrada'))
      }
      return res.status(404).json(ApiResponse.notFound('Caja', req.params.id))
    }
    res.json(ApiResponse.success({ balance: result, message: 'Caja cerrada exitosamente' }))
  }
)

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
export function logCobranzasError(err: unknown): void {
  logger.error({ err }, 'Error en modulo cobranzas')
}

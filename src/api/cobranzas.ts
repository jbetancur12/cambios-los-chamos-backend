import express, { Request, Response } from 'express'
import { requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { UserRole } from '@/entities/User'
import { CreditStatus } from '@/entities/Credit'
import {
  createCobranzaClientSchema,
  updateCobranzaClientSchema,
  createCreditSchema,
  updateCreditSchema,
  followUpSchema,
  registerPaymentSchema,
} from '@/schemas/cobranzasSchemas'
import { cobranzaClientService } from '@/services/cobranzas/CobranzaClientService'
import { creditService } from '@/services/cobranzas/CreditService'
import { paymentService } from '@/services/cobranzas/PaymentService'
import { DI } from '@/di'

export const cobranzasRouter = express.Router()

const requireSuperAdmin = requireRole(UserRole.SUPER_ADMIN)

const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)
const num = (value: unknown): number | undefined => (value ? Number(value) : undefined)

// ============================================================================
// Por cobrar (inicio)
// ============================================================================
cobranzasRouter.get('/collections', requireSuperAdmin, async (_req: Request, res: Response) => {
  res.json(ApiResponse.success(await creditService.getCollections()))
})

// ============================================================================
// Clientes
// ============================================================================
cobranzasRouter.get('/clients', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cobranzaClientService.list({
    search: str(req.query.search),
    page: num(req.query.page),
    limit: num(req.query.limit),
  })
  res.json(ApiResponse.success(result))
})

cobranzasRouter.get('/clients/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const detail = await cobranzaClientService.getDetail(req.params.id)
  if (!detail) {
    return res.status(404).json(ApiResponse.notFound('Cliente', req.params.id))
  }
  res.json(ApiResponse.success(detail))
})

cobranzasRouter.post(
  '/clients',
  requireSuperAdmin,
  validateBody(createCobranzaClientSchema),
  async (req: Request, res: Response) => {
    const result = await cobranzaClientService.create(req.body)
    if ('error' in result) {
      return res.status(409).json(ApiResponse.conflict('Ya existe un cliente con esa cédula'))
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
      if (result.error === 'DUPLICATE_IDENTIFICATION') {
        return res.status(409).json(ApiResponse.conflict('Ya existe un cliente con esa cédula'))
      }
      return res.status(404).json(ApiResponse.notFound('Cliente', req.params.id))
    }
    res.json(ApiResponse.success({ client: result, message: 'Cliente actualizado exitosamente' }))
  }
)

cobranzasRouter.delete('/clients/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cobranzaClientService.remove(req.params.id)
  if (result !== true) {
    if (result.error === 'HAS_CREDITS') {
      return res.status(409).json(ApiResponse.conflict('El cliente tiene préstamos registrados'))
    }
    return res.status(404).json(ApiResponse.notFound('Cliente', req.params.id))
  }
  res.json(ApiResponse.success({ message: 'Cliente eliminado exitosamente' }))
})

// ============================================================================
// Préstamos
// ============================================================================
const creditErrorResponse = (res: Response, error: string, id?: string) => {
  switch (error) {
    case 'CLIENT_NOT_FOUND':
      return res.status(404).json(ApiResponse.notFound('Cliente'))
    case 'CLIENT_INACTIVE':
      return res.status(400).json(ApiResponse.error('El cliente está inactivo'))
    case 'HAS_PAYMENTS':
      return res.status(409).json(ApiResponse.conflict('El préstamo ya tiene pagos registrados'))
    case 'NOT_ACTIVE':
      return res.status(409).json(ApiResponse.conflict('El préstamo no está activo'))
    default:
      return res.status(404).json(ApiResponse.notFound('Préstamo', id))
  }
}

cobranzasRouter.get('/credits', requireSuperAdmin, async (req: Request, res: Response) => {
  const status = str(req.query.status)
  const result = await creditService.listCredits({
    status:
      status && Object.values(CreditStatus).includes(status as CreditStatus) ? (status as CreditStatus) : undefined,
    clientId: str(req.query.clientId),
    search: str(req.query.search),
    overdueOnly: req.query.overdueOnly === 'true',
    page: num(req.query.page),
    limit: num(req.query.limit),
  })
  res.json(ApiResponse.success(result))
})

cobranzasRouter.get('/credits/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await creditService.getCreditDetail(req.params.id)
  if ('error' in result) {
    return creditErrorResponse(res, result.error, req.params.id)
  }
  res.json(ApiResponse.success(result))
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
      return creditErrorResponse(res, result.error)
    }
    res.status(201).json(ApiResponse.success({ credit: result, message: 'Préstamo creado exitosamente' }))
  }
)

cobranzasRouter.patch(
  '/credits/:id',
  requireSuperAdmin,
  validateBody(updateCreditSchema),
  async (req: Request, res: Response) => {
    const result = await creditService.updateCredit(req.params.id, req.body)
    if ('error' in result) {
      return creditErrorResponse(res, result.error, req.params.id)
    }
    res.json(ApiResponse.success({ credit: result, message: 'Préstamo actualizado exitosamente' }))
  }
)

cobranzasRouter.post('/credits/:id/cancel', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await creditService.cancelCredit(req.params.id)
  if ('error' in result) {
    return creditErrorResponse(res, result.error, req.params.id)
  }
  res.json(ApiResponse.success({ credit: result, message: 'Préstamo anulado' }))
})

cobranzasRouter.post(
  '/credits/:id/follow-ups',
  requireSuperAdmin,
  validateBody(followUpSchema),
  async (req: Request, res: Response) => {
    const userId = req.context?.requestUser?.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const result = await creditService.addFollowUp(req.params.id, req.body.note, userId)
    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Préstamo', req.params.id))
    }
    res.status(201).json(ApiResponse.success({ followUp: result, message: 'Nota guardada' }))
  }
)

cobranzasRouter.delete(
  '/credits/:id/follow-ups/:followUpId',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    const result = await creditService.removeFollowUp(req.params.followUpId)
    if (result !== true) {
      return res.status(404).json(ApiResponse.notFound('Nota', req.params.followUpId))
    }
    res.json(ApiResponse.success({ message: 'Nota eliminada' }))
  }
)

// ============================================================================
// Pagos
// ============================================================================
cobranzasRouter.get('/payments', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await paymentService.list({
    creditId: str(req.query.creditId),
    clientId: str(req.query.clientId),
    from: str(req.query.from),
    to: str(req.query.to),
    page: num(req.query.page),
    limit: num(req.query.limit),
  })
  res.json(ApiResponse.success(result))
})

cobranzasRouter.get('/payments/:id/receipt', requireSuperAdmin, async (req: Request, res: Response) => {
  const payment = await DI.payments.findOne({ id: req.params.id }, { populate: ['client', 'credit', 'receivedBy'] })
  if (!payment) {
    return res.status(404).json(ApiResponse.notFound('Pago', req.params.id))
  }
  res.json(
    ApiResponse.success({
      payment,
      receiptNumber: `R-${payment.id.slice(0, 8).toUpperCase()}`,
      businessName: 'Inversiones R&M',
    })
  )
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
          return res.status(404).json(ApiResponse.notFound('Préstamo'))
        case 'CREDIT_CLOSED':
          return res.status(409).json(ApiResponse.conflict('El préstamo ya está saldado o anulado'))
        case 'EXCEEDS_BALANCE':
          return res.status(400).json(ApiResponse.error('El monto excede el saldo del préstamo'))
      }
    }
    res
      .status(201)
      .json(ApiResponse.success({ payment: result.payment, credit: result.credit, coverage: result.coverage }))
  }
)

cobranzasRouter.delete('/payments/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await paymentService.remove(req.params.id)
  if (result !== true) {
    return res.status(404).json(ApiResponse.notFound('Pago', req.params.id))
  }
  res.json(ApiResponse.success({ message: 'Pago anulado' }))
})

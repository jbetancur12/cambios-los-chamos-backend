import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createTransactionSchema } from '@/schemas/minoristaTransactionSchema'
import { UserRole } from '@/entities/User'
import { minoristaTransactionService } from '@/services/MinoristaTransactionService'

export const minoristaTransactionRouter = express.Router()

// ------------------ CREAR TRANSACCIÓN ------------------
minoristaTransactionRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(createTransactionSchema),
  async (req: Request, res: Response) => {
    const { minoristaId, amount, type } = req.body

    if (!req.user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const result = await minoristaTransactionService.createTransaction({
      minoristaId,
      amount,
      type,
      createdBy: req.user,
    })

    if ('error' in result) {
      switch (result.error) {
        case 'MINORISTA_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
        case 'INSUFFICIENT_BALANCE':
          return res.status(400).json(ApiResponse.badRequest('Saldo insuficiente para esta operación'))
      }
    }

    res.status(201).json(
      ApiResponse.success({
        data: result,
        message: 'Transacción creada exitosamente',
      })
    )
  }
)

// ------------------ LISTAR TRANSACCIONES POR MINORISTA ------------------
minoristaTransactionRouter.get('/by-minorista/:minoristaId', requireAuth(), async (req: Request, res: Response) => {
  const { minoristaId } = req.params
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 50

  const result = await minoristaTransactionService.listTransactionsByMinorista(minoristaId, {
    page,
    limit,
  })

  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
  }

  res.json(ApiResponse.success(result))
})

// ------------------ OBTENER TRANSACCIÓN POR ID ------------------
minoristaTransactionRouter.get('/:transactionId', requireAuth(), async (req: Request, res: Response) => {
  const { transactionId } = req.params

  const result = await minoristaTransactionService.getTransactionById(transactionId)

  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Transacción', transactionId))
  }

  res.json(ApiResponse.success({ transaction: result }))
})

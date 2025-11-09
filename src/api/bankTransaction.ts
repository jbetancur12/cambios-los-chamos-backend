import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createBankTransactionSchema } from '@/schemas/bankTransactionSchema'
import { UserRole } from '@/entities/User'
import { bankTransactionService } from '@/services/BankTransactionService'

export const bankTransactionRouter = express.Router()

// ------------------ CREAR TRANSACCIÓN ------------------
bankTransactionRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(createBankTransactionSchema),
  async (req: Request, res: Response) => {
    const { bankId, amount, type, commission } = req.body

    const result = await bankTransactionService.createTransaction({
      bankId,
      amount,
      type,
      commission,
      createdBy: req.user!,
    })

    if ('error' in result) {
      switch (result.error) {
        case 'BANK_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Banco', bankId))
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

// ------------------ LISTAR TRANSACCIONES POR BANCO ------------------
bankTransactionRouter.get('/by-bank/:bankId', requireAuth(), async (req: Request, res: Response) => {
  const { bankId } = req.params
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 50

  const result = await bankTransactionService.listTransactionsByBank(bankId, {
    page,
    limit,
  })

  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Banco', bankId))
  }

  res.json(ApiResponse.success(result))
})

// ------------------ OBTENER TRANSACCIÓN POR ID ------------------
bankTransactionRouter.get('/:transactionId', requireAuth(), async (req: Request, res: Response) => {
  const { transactionId } = req.params

  const result = await bankTransactionService.getTransactionById(transactionId)

  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Transacción', transactionId))
  }

  res.json(ApiResponse.success({ transaction: result }))
})

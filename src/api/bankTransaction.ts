import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createBankTransactionSchema } from '@/schemas/bankTransactionSchema'
import { UserRole } from '@/entities/User'
import { bankTransactionService } from '@/services/BankTransactionService'

export const bankTransactionRouter = express.Router()

// ------------------ CREAR REGISTRO DE TRANSACCIÓN (SOLO TRACKING) ------------------
bankTransactionRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(createBankTransactionSchema),
  async (req: Request, res: Response) => {
    const { bankId, amount, type, description, reference } = req.body

    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const result = await bankTransactionService.createTransaction({
      bankId,
      amount,
      type,
      description,
      reference,
      createdBy: user,
    })

    if ('error' in result) {
      switch (result.error) {
        case 'BANK_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Banco', bankId))
      }
    }

    res.status(201).json(
      ApiResponse.success({
        data: result,
        message: 'Registro de transacción creado exitosamente (solo tracking, no modifica balance)',
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

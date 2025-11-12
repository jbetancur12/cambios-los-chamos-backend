import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import {
  createBankAccountSchema,
  listBankAccountsSchema,
  updateBankAccountBalanceSchema,
} from '@/schemas/bankAccountSchema'
import { bankAccountService } from '@/services/BankAccountService'
import { DI } from '@/di'
import { validateParams } from '@/lib/validateParams'
import { bankAccountTransactionService } from '@/services/BankAccountTransactionService'
import { BankAccount } from '@/entities/BankAccount'

export const bankAccountRouter = express.Router({ mergeParams: true })

// ------------------ CREAR CUENTA BANCARIA ------------------
bankAccountRouter.post(
  '/create',
  requireAuth(),
  requireRole(UserRole.SUPER_ADMIN),
  validateBody(createBankAccountSchema),
  async (req: Request, res: Response) => {
    const { transferencistaId, bankId, accountNumber, accountHolder, accountType } = req.body
    try {
      const bankAccount = await bankAccountService.createBankAccount({
        transferencistaId,
        bankId,
        accountNumber,
        accountHolder,
        accountType,
      })

      res.status(201).json(
        ApiResponse.success({
          data: bankAccount,
          message: 'Cuenta bancaria creada exitosamente',
        })
      )
    } catch (err: any) {
      if (err.message.includes('Transferencista no encontrado')) {
        return res.status(404).json(ApiResponse.notFound('Transferencista'))
      }
      if (err.message.includes('Banco no encontrado')) {
        return res.status(404).json(ApiResponse.notFound('Banco'))
      }
      if (err.message.includes('Número de cuenta ya registrado')) {
        return res.status(400).json(ApiResponse.validationErrorSingle('accountNumber', err.message))
      }
      res.status(500).json(ApiResponse.error('Error al crear cuenta bancaria'))
    }
  }
)

// ------------------ OBTENER CUENTAS DE UN TRANSFERENCISTA ------------------
bankAccountRouter.get('/transferencista/:transferenciaId', requireAuth(), async (req: Request, res: Response) => {
  const { transferenciaId } = req.params
  const user = req.context?.requestUser?.user

  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  // Verificar permisos: solo el transferencista dueño o admin/superadmin
  if (user.role === UserRole.TRANSFERENCISTA) {
    const transferencista = await DI.transferencistas.findOne({ user: user.id })
    if (!transferencista || transferencista.id !== transferenciaId) {
      return res.status(403).json(ApiResponse.forbidden('No tienes permisos para ver estas cuentas'))
    }
  }

  const result = await bankAccountService.getBankAccountsByTransferencista(transferenciaId)

  if ('error' in result) {
    switch (result.error) {
      case 'TRANSFERENCISTA_NOT_FOUND':
        return res.status(404).json(ApiResponse.notFound('Transferencista'))
    }
  }

  res.json(ApiResponse.success({ bankAccounts: result }))
})

// ------------------ OBTENER MIS CUENTAS (TRANSFERENCISTA) ------------------
bankAccountRouter.get('/my-accounts', requireRole(UserRole.TRANSFERENCISTA), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user

  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  // Buscar el transferencista asociado al usuario
  const transferencista = await DI.transferencistas.findOne({ user: user.id })
  if (!transferencista) {
    return res.status(404).json(ApiResponse.notFound('Transferencista'))
  }

  const result = await bankAccountService.getBankAccountsByTransferencista(transferencista.id)

  if ('error' in result) {
    switch (result.error) {
      case 'TRANSFERENCISTA_NOT_FOUND':
        return res.status(404).json(ApiResponse.notFound('Transferencista'))
    }
  }

  res.json(ApiResponse.success({ bankAccounts: result }))
})

// ------------------ OBTENER CUENTA POR ID ------------------
bankAccountRouter.get(
  '/list/:transferencistaId',
  requireAuth(),
  validateParams(listBankAccountsSchema),
  async (req: Request, res: Response) => {
    const { transferencistaId } = req.params

    try {
      const accounts = await bankAccountService.listByTransferencista(transferencistaId)
      res.json(ApiResponse.success({ accounts }))
    } catch (err: any) {
      if (err.message.includes('Transferencista no encontrado')) {
        return res.status(404).json(ApiResponse.notFound('Transferencista'))
      }
      res.status(500).json(ApiResponse.error('Error al listar cuentas'))
    }
  }
)

// ------------------ ACTUALIZAR BALANCE ------------------
bankAccountRouter.patch(
  '/update',
  requireAuth(),
  requireRole(UserRole.SUPER_ADMIN),
  validateBody(updateBankAccountBalanceSchema),
  async (req: Request, res: Response) => {
    const { bankAccountId, amount } = req.body

    try {
      const account = await bankAccountService.updateBalance(bankAccountId, amount)
      res.json(ApiResponse.success({ data: account, message: 'Saldo actualizado exitosamente' }))
    } catch (err: any) {
      if (err.message.includes('Cuenta bancaria no encontrada')) {
        return res.status(404).json(ApiResponse.notFound('Cuenta bancaria'))
      }
      res.status(500).json(ApiResponse.error('Error al recargar saldo'))
    }
  }
)

// ------------------ LISTAR TRANSACCIONES DE UNA CUENTA ------------------
bankAccountRouter.get(
  '/:bankAccountId/transactions',
  requireRole(UserRole.TRANSFERENCISTA),
  async (req: Request, res: Response) => {
    const { bankAccountId } = req.params
    const user = req.context?.requestUser?.user

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    // Buscar el transferencista asociado al usuario
    const transferencista = await DI.transferencistas.findOne({ user: user.id })
    if (!transferencista) {
      return res.status(404).json(ApiResponse.notFound('Transferencista'))
    }

    // Verificar que la cuenta bancaria pertenece al transferencista
    const bankAccountRepo = DI.em.getRepository(BankAccount)
    const bankAccount = await bankAccountRepo.findOne({ id: bankAccountId }, { populate: ['transferencista'] })

    if (!bankAccount) {
      return res.status(404).json(ApiResponse.notFound('Cuenta bancaria'))
    }

    if (bankAccount.transferencista.id !== transferencista.id) {
      return res.status(403).json(ApiResponse.forbidden('No tienes permisos para ver las transacciones de esta cuenta'))
    }

    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 50

    const result = await bankAccountTransactionService.listTransactionsByBankAccount(bankAccountId, {
      page,
      limit,
    })

    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Cuenta bancaria'))
    }

    res.json(
      ApiResponse.success({
        transactions: result.transactions,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      })
    )
  }
)

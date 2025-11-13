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

// ------------------ OBTENER TODAS LAS CUENTAS (ADMIN/SUPER_ADMIN) ------------------
bankAccountRouter.get(
  '/all',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    const bankAccountRepo = DI.em.getRepository(BankAccount)

    const accounts = await bankAccountRepo.find({}, { populate: ['bank', 'transferencista', 'transferencista.user'] })

    const formattedAccounts = accounts.map((account) => ({
      id: account.id,
      accountNumber: account.accountNumber,
      accountHolder: account.accountHolder,
      accountType: account.accountType,
      balance: account.balance,
      bank: {
        id: account.bank.id,
        name: account.bank.name,
        code: account.bank.code,
      },
      transferencista: {
        id: account.transferencista.id,
        user: {
          id: account.transferencista.user.id,
          fullName: account.transferencista.user.fullName,
          email: account.transferencista.user.email,
        },
      },
    }))

    res.json(ApiResponse.success({ bankAccounts: formattedAccounts }))
  }
)

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

// ------------------ OBTENER CUENTA BANCARIA INDIVIDUAL ------------------
bankAccountRouter.get('/:bankAccountId', requireAuth(), async (req: Request, res: Response) => {
  const { bankAccountId } = req.params
  const user = req.context?.requestUser?.user

  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const bankAccountRepo = DI.em.getRepository(BankAccount)
  const bankAccount = await bankAccountRepo.findOne({ id: bankAccountId }, { populate: ['bank', 'transferencista'] })

  if (!bankAccount) {
    return res.status(404).json(ApiResponse.notFound('Cuenta bancaria'))
  }

  // Verificar permisos
  if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
    if (user.role === UserRole.TRANSFERENCISTA) {
      const transferencista = await DI.transferencistas.findOne({ user: user.id })
      if (!transferencista || bankAccount.transferencista.id !== transferencista.id) {
        return res.status(403).json(ApiResponse.forbidden('No tienes permisos para ver esta cuenta'))
      }
    } else {
      return res.status(403).json(ApiResponse.forbidden('No tienes permisos para ver esta cuenta'))
    }
  }

  res.json(
    ApiResponse.success({
      bankAccount: {
        id: bankAccount.id,
        accountNumber: bankAccount.accountNumber,
        accountHolder: bankAccount.accountHolder,
        accountType: bankAccount.accountType,
        balance: bankAccount.balance,
        bank: {
          id: bankAccount.bank.id,
          name: bankAccount.bank.name,
          code: bankAccount.bank.code,
        },
      },
    })
  )
})

// ------------------ ACTUALIZAR BALANCE ------------------
bankAccountRouter.patch(
  '/update',
  requireAuth(),
  requireRole(UserRole.SUPER_ADMIN),
  validateBody(updateBankAccountBalanceSchema),
  async (req: Request, res: Response) => {
    const { bankAccountId, amount } = req.body
    const user = req.context?.requestUser?.user

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    // Determinar el tipo de transacción según si es positivo o negativo
    const transactionType = amount >= 0 ? 'DEPOSIT' : 'ADJUSTMENT'

    const result = await bankAccountTransactionService.createTransaction({
      bankAccountId,
      amount: Math.abs(amount), // El servicio maneja el signo según el tipo
      type: transactionType as any,
      reference: 'Recarga manual de saldo',
      createdBy: user,
    })

    if ('error' in result) {
      switch (result.error) {
        case 'BANK_ACCOUNT_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Cuenta bancaria'))
        case 'INSUFFICIENT_BALANCE':
          return res.status(400).json(ApiResponse.badRequest('Balance insuficiente para esta operación'))
      }
    }

    res.json(ApiResponse.success({ message: 'Saldo actualizado exitosamente' }))
  }
)

// ------------------ LISTAR TRANSACCIONES DE UNA CUENTA ------------------
bankAccountRouter.get('/:bankAccountId/transactions', requireAuth(), async (req: Request, res: Response) => {
  const { bankAccountId } = req.params
  const user = req.context?.requestUser?.user

  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  // Verificar que la cuenta bancaria existe
  const bankAccountRepo = DI.em.getRepository(BankAccount)
  const bankAccount = await bankAccountRepo.findOne({ id: bankAccountId }, { populate: ['transferencista'] })

  if (!bankAccount) {
    return res.status(404).json(ApiResponse.notFound('Cuenta bancaria'))
  }

  // Verificar permisos según rol
  if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
    // Si es transferencista, debe ser el dueño de la cuenta
    if (user.role === UserRole.TRANSFERENCISTA) {
      const transferencista = await DI.transferencistas.findOne({ user: user.id })
      if (!transferencista || bankAccount.transferencista.id !== transferencista.id) {
        return res
          .status(403)
          .json(ApiResponse.forbidden('No tienes permisos para ver las transacciones de esta cuenta'))
      }
    } else {
      // Otros roles no tienen acceso
      return res.status(403).json(ApiResponse.forbidden('No tienes permisos para ver las transacciones de esta cuenta'))
    }
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
})

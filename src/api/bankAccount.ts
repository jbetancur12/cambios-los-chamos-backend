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
import { BankAccount, BankAccountOwnerType } from '@/entities/BankAccount'
import { BankAccountTransactionType } from '@/entities/BankAccountTransaction'
import { canAccessBankAccount } from '@/lib/bankAccountPermissions'
import { logger } from '@/lib/logger'

export const bankAccountRouter = express.Router({ mergeParams: true })

// ------------------ CREAR CUENTA BANCARIA ------------------
// ✨ SOLO SUPERADMIN puede crear cuentas ADMIN compartidas
bankAccountRouter.post(
  '/create',
  requireAuth(),
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(createBankAccountSchema),
  async (req: Request, res: Response) => {
    const user = req.context?.requestUser?.user
    const { bankId, accountHolder, ownerType, ownerId } = req.body

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    // Validar que ownerType sea válido
    if (![BankAccountOwnerType.TRANSFERENCISTA, BankAccountOwnerType.ADMIN].includes(ownerType)) {
      return res.status(400).json(ApiResponse.validationErrorSingle('ownerType', 'ownerType inválido'))
    }

    // ✨ NUEVA VALIDACIÓN: SUPERADMIN y ADMIN pueden crear cuentas ADMIN
    if (
      ownerType === BankAccountOwnerType.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN
    ) {
      return res
        .status(403)
        .json(ApiResponse.forbidden('Solo SUPERADMIN o ADMIN pueden crear cuentas ADMIN compartidas'))
    }

    try {
      const result = await bankAccountService.createBankAccount({
        bankId,
        accountHolder,
        ownerType,
        ownerId,
      })

      if ('error' in result) {
        switch (result.error) {
          case 'TRANSFERENCISTA_NOT_FOUND':
            return res.status(404).json(ApiResponse.notFound('Transferencista'))
          case 'BANK_NOT_FOUND':
            return res.status(404).json(ApiResponse.notFound('Banco'))
          case 'OWNER_ID_REQUIRED_FOR_TRANSFERENCISTA':
            return res
              .status(400)
              .json(
                ApiResponse.validationErrorSingle('ownerId', 'ownerId es requerido para cuentas de TRANSFERENCISTA')
              )
        }
      }

      res.status(201).json(
        ApiResponse.success({
          data: result,
          message: 'Cuenta bancaria creada exitosamente',
        })
      )
    } catch (err) {
      logger.error({ err }, 'Error al crear cuenta bancaria')
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
// ✨ ACTUALIZADO: Incluye ownerType y ownerId
bankAccountRouter.get(
  '/all',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    const bankAccountRepo = DI.em.getRepository(BankAccount)

    const accounts = await bankAccountRepo.find({}, { populate: ['bank', 'transferencista', 'transferencista.user'] })

    const formattedAccounts = accounts.map((account) => {
      const formatted: Record<string, unknown> = {
        id: account.id,
        accountHolder: account.accountHolder,
        balance: account.balance,
        ownerType: account.ownerType,
        ownerId: account.ownerId,
        bank: {
          id: account.bank.id,
          name: account.bank.name,
          code: account.bank.code,
        },
      }

      // Solo incluir transferencista si existe
      if (account.transferencista) {
        formatted.transferencista = {
          id: account.transferencista.id,
          user: {
            id: account.transferencista.user.id,
            fullName: account.transferencista.user.fullName,
            email: account.transferencista.user.email,
          },
        }
      }

      return formatted
    })

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
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Transferencista no encontrado')) {
        return res.status(404).json(ApiResponse.notFound('Transferencista'))
      }
      res.status(500).json(ApiResponse.error('Error al listar cuentas'))
    }
  }
)

// ------------------ OBTENER CUENTA BANCARIA INDIVIDUAL ------------------
// ✨ ACTUALIZADO: Usa canAccessBankAccount para validar permisos
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

  // ✨ Verificar permisos usando la función de validación
  if (!canAccessBankAccount(bankAccount, user)) {
    return res.status(403).json(ApiResponse.forbidden('No tienes permisos para ver esta cuenta'))
  }

  const formatted: Record<string, unknown> = {
    id: bankAccount.id,
    accountHolder: bankAccount.accountHolder,
    balance: bankAccount.balance,
    ownerType: bankAccount.ownerType,
    ownerId: bankAccount.ownerId,
    bank: {
      id: bankAccount.bank.id,
      name: bankAccount.bank.name,
      code: bankAccount.bank.code,
    },
  }

  // Solo incluir transferencista si existe
  if (bankAccount.transferencista) {
    formatted.transferencista = {
      id: bankAccount.transferencista.id,
      user: {
        id: bankAccount.transferencista.user.id,
        fullName: bankAccount.transferencista.user.fullName,
        email: bankAccount.transferencista.user.email,
      },
    }
  }

  res.json(ApiResponse.success({ bankAccount: formatted }))
})

// ------------------ ACTUALIZAR BALANCE ------------------
bankAccountRouter.patch(
  '/update',
  requireAuth(),
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(updateBankAccountBalanceSchema),
  async (req: Request, res: Response) => {
    const { bankAccountId, amount } = req.body
    const user = req.context?.requestUser?.user

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    // Determinar el tipo de transacción según si es positivo o negativo
    const transactionType = amount >= 0 ? 'DEPOSIT' : 'ADJUSTMENT'
    logger.debug({ transactionType }, 'Actualizando balance')

    const result = await bankAccountTransactionService.createTransaction({
      bankAccountId,
      amount: amount >= 0 ? Math.abs(amount) : amount, // DEPOSIT usa valor absoluto, ADJUSTMENT usa el signo
      type: transactionType as BankAccountTransactionType,
      reference: 'Recarga manual de saldo',
      fee: 0,
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
      if (!transferencista || !bankAccount.transferencista || bankAccount.transferencista.id !== transferencista.id) {
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

  // Parse dates from ISO strings
  let startDate: string | undefined = undefined
  let endDate: string | undefined = undefined

  if (req.query.startDate) {
    const startDateStr = req.query.startDate as string
    const parsedStartDate = new Date(startDateStr)
    if (isNaN(parsedStartDate.getTime())) {
      return res.status(400).json(ApiResponse.badRequest('Invalid startDate format'))
    }
    startDate = startDateStr
  }

  if (req.query.endDate) {
    const endDateStr = req.query.endDate as string
    const parsedEndDate = new Date(endDateStr)
    if (isNaN(parsedEndDate.getTime())) {
      return res.status(400).json(ApiResponse.badRequest('Invalid endDate format'))
    }
    endDate = endDateStr
  }

  const result = await bankAccountTransactionService.listTransactionsByBankAccount(bankAccountId, {
    page,
    limit,
    startDate,
    endDate,
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

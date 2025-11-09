import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createBankAccountSchema, updateBankAccountBalanceSchema } from '@/schemas/bankAccountSchema'
import { bankAccountService } from '@/services/BankAccountService'
import { DI } from '@/di'

export const bankAccountRouter = express.Router({ mergeParams: true })

// ------------------ CREAR CUENTA BANCARIA ------------------
bankAccountRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TRANSFERENCISTA),
  validateBody(createBankAccountSchema),
  async (req: Request, res: Response) => {
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const { transferenciaId, bankId, accountNumber, accountHolder, accountType, balance } = req.body

    const result = await bankAccountService.createBankAccount(
      {
        transferenciaId,
        bankId,
        accountNumber,
        accountHolder,
        accountType,
        balance,
      },
      user
    )

    if ('error' in result) {
      switch (result.error) {
        case 'TRANSFERENCISTA_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Transferencista'))
        case 'BANK_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Banco'))
        case 'ACCOUNT_NUMBER_EXISTS':
          return res
            .status(409)
            .json(ApiResponse.conflict('Ya existe una cuenta con este número para este transferencista'))
      }
    }

    res.status(201).json(ApiResponse.success({ bankAccount: result, message: 'Cuenta bancaria creada exitosamente' }))
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
bankAccountRouter.get('/:bankAccountId', requireAuth(), async (req: Request, res: Response) => {
  const { bankAccountId } = req.params
  const user = req.context?.requestUser?.user

  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const result = await bankAccountService.getBankAccountById(bankAccountId)

  if ('error' in result) {
    switch (result.error) {
      case 'BANK_ACCOUNT_NOT_FOUND':
        return res.status(404).json(ApiResponse.notFound('Cuenta bancaria', bankAccountId))
    }
  }

  // Verificar permisos: solo el transferencista dueño o admin/superadmin
  if (user.role === UserRole.TRANSFERENCISTA) {
    if (result.transferencista.user.id !== user.id) {
      return res.status(403).json(ApiResponse.forbidden('No tienes permisos para ver esta cuenta'))
    }
  }

  res.json(ApiResponse.success({ bankAccount: result }))
})

// ------------------ ACTUALIZAR BALANCE ------------------
bankAccountRouter.patch(
  '/:bankAccountId/balance',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(updateBankAccountBalanceSchema),
  async (req: Request, res: Response) => {
    const { bankAccountId } = req.params
    const { balance } = req.body

    const result = await bankAccountService.updateBalance(bankAccountId, balance)

    if ('error' in result) {
      switch (result.error) {
        case 'BANK_ACCOUNT_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Cuenta bancaria', bankAccountId))
        case 'INVALID_BALANCE':
          return res.status(400).json(ApiResponse.badRequest('El balance no puede ser negativo'))
      }
    }

    res.json(ApiResponse.success({ bankAccount: result, message: 'Balance actualizado exitosamente' }))
  }
)

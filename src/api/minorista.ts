import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createMinoristaSchema, updateMinoristaBalanceSchema } from '@/schemas/minoristaSchema'
import { UserRole } from '@/entities/User'
import { minoristaService } from '@/services/MinoristaService'
import { minoristaTransactionService } from '@/services/MinoristaTransactionService'
import { DI } from '@/di'
import { Minorista } from '@/entities/Minorista'
import { MinoristaTransaction } from '@/entities/MinoristaTransaction'

export const minoristaRouter = express.Router()

// ------------------ CREAR MINORISTA ------------------
minoristaRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(createMinoristaSchema),
  async (req: Request, res: Response) => {
    const { fullName, email, password, balance } = req.body

    const result = await minoristaService.createMinorista({
      fullName,
      email,
      password,
      balance,
    })

    if ('error' in result) {
      switch (result.error) {
        case 'EMAIL_ALREADY_EXISTS':
          return res.status(409).json(ApiResponse.conflict('El email ya está registrado'))
      }
    }

    res.status(201).json(
      ApiResponse.success({
        data: result,
        message: 'Minorista creado exitosamente',
      })
    )
  }
)

// ------------------ OBTENER MI MINORISTA (USUARIO ACTUAL) ------------------
minoristaRouter.get('/me', requireRole(UserRole.MINORISTA), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const result = await minoristaService.getMinoristaByUserId(user.id)

  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Minorista'))
  }

  // Transform response to match frontend expectations: balance = availableCredit, credit = creditBalance
  res.json(
    ApiResponse.success({
      minorista: result,
      balance: result.availableCredit,
      credit: result.creditBalance,
    })
  )
})

// ------------------ LISTAR MINORISTAS ------------------
minoristaRouter.get('/list', requireAuth(), async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 50

  const result = await minoristaService.listMinoristas({ page, limit })

  res.json(ApiResponse.success(result))
})

// ------------------ OBTENER MINORISTA POR ID ------------------
minoristaRouter.get('/:minoristaId', requireAuth(), async (req: Request, res: Response) => {
  const { minoristaId } = req.params

  const result = await minoristaService.getMinoristaById(minoristaId)

  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
  }

  res.json(ApiResponse.success({ minorista: result }))
})

// ------------------ ACTUALIZAR BALANCE ------------------ DEPRECATED
minoristaRouter.patch(
  '/:minoristaId/balance',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(updateMinoristaBalanceSchema),
  async (req: Request, res: Response) => {
    const { minoristaId } = req.params
    const { balance } = req.body

    const result = await minoristaService.updateBalance(minoristaId, balance)

    if ('error' in result) {
      switch (result.error) {
        case 'MINORISTA_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
        case 'INVALID_BALANCE':
          return res.status(400).json(ApiResponse.badRequest('El balance no puede ser negativo'))
      }
    }

    res.json(ApiResponse.success({ minorista: result, message: 'Balance actualizado exitosamente' }))
  }
)

// ------------------ ASIGNAR/RECARGAR CUPO DE CRÉDITO ------------------
minoristaRouter.post(
  '/:minoristaId/credit-limit',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    const { minoristaId } = req.params
    const { creditLimit } = req.body
    const user = req.context?.requestUser?.user

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    if (!creditLimit || creditLimit <= 0) {
      return res.status(400).json(ApiResponse.badRequest('El cupo de crédito debe ser mayor a 0'))
    }

    const result = await minoristaService.setCreditLimit(minoristaId, creditLimit)

    if ('error' in result) {
      switch (result.error) {
        case 'MINORISTA_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
      }
    }

    res.json(ApiResponse.success({ minorista: result, message: 'Cupo de crédito asignado exitosamente' }))
  }
)

// ------------------ PAGAR DEUDA (RESTABLECER CUPO) ------------------
minoristaRouter.post(
  '/:minoristaId/pay-debt',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINORISTA),
  async (req: Request, res: Response) => {
    const { minoristaId } = req.params
    const { amount } = req.body
    const user = req.context?.requestUser?.user

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    // Si es minorista, solo puede pagar su propia deuda
    if (user.role === UserRole.MINORISTA) {
      const minoristaRepo = DI.em.getRepository(Minorista)
      const userMinorista = await minoristaRepo.findOne({ user: user.id })
      if (!userMinorista || userMinorista.id !== minoristaId) {
        return res.status(403).json(ApiResponse.forbidden('No tienes permiso para pagar la deuda de otro minorista'))
      }
    }

    // Validación de monto
    if (!amount || amount === 0) {
      return res.status(400).json(ApiResponse.badRequest('El monto no puede ser 0'))
    }

    // Minoristas solo pueden pagar (monto positivo)
    if (user.role === UserRole.MINORISTA && amount < 0) {
      return res.status(400).json(ApiResponse.badRequest('El monto a pagar debe ser mayor a 0'))
    }

    const result = await minoristaService.payDebt(minoristaId, amount, user)

    if ('error' in result) {
      switch (result.error) {
        case 'MINORISTA_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
        case 'INSUFFICIENT_PAYMENT':
          return res.status(400).json(ApiResponse.badRequest('El monto pagado no es suficiente para restaurar el cupo'))
      }
    }

    res.json(ApiResponse.success({ minorista: result, message: 'Deuda pagada exitosamente' }))
  }
)

// ------------------ OBTENER TRANSACCIONES DE MINORISTA ------------------
minoristaRouter.get(
  '/:minoristaId/transactions',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINORISTA),
  async (req: Request, res: Response) => {
    const { minoristaId } = req.params
    const user = req.context?.requestUser?.user

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    // Validar que el minorista no acceda a transacciones de otros
    if (user.role === UserRole.MINORISTA) {
      const minoristaRepo = DI.em.getRepository(Minorista)
      const userMinorista = await minoristaRepo.findOne({ user: user.id })
      if (!userMinorista || userMinorista.id !== minoristaId) {
        return res.status(403).json(ApiResponse.forbidden('No tienes permiso para ver transacciones de otro minorista'))
      }
    }

    try {
      const minoristaRepo = DI.em.getRepository(Minorista)
      const transactionRepo = DI.em.getRepository(MinoristaTransaction)

      const minorista = await minoristaRepo.findOne({ id: minoristaId })
      if (!minorista) {
        return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
      }

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 50
      let startDate: string | undefined = undefined
      let endDate: string | undefined = undefined

      // Parse and validate ISO strings
      if (req.query.startDate) {
        const startStr = req.query.startDate as string
        const parsedStart = new Date(startStr)
        if (isNaN(parsedStart.getTime())) {
          return res.status(400).json(ApiResponse.badRequest('Invalid startDate format. Use ISO 8601 format.'))
        }
        startDate = startStr
      }

      if (req.query.endDate) {
        const endStr = req.query.endDate as string
        const parsedEnd = new Date(endStr)
        if (isNaN(parsedEnd.getTime())) {
          return res.status(400).json(ApiResponse.badRequest('Invalid endDate format. Use ISO 8601 format.'))
        }
        endDate = endStr
      }

      const result = await minoristaTransactionService.listTransactionsByMinorista(minoristaId, {
        page,
        limit,
        startDate,
        endDate,
      })

      if ('error' in result) {
        console.error(`[API] Error fetching transactions: ${result.error}`)
        return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
      }

      const transactions = result.transactions
      const total = result.total

      console.log(`[API] Found ${transactions.length} transactions (Total: ${total}) for minorista ${minoristaId}`)

      if (transactions.length === 0) {
        return res.json(
          ApiResponse.success({
            transactions: [],
            pagination: {
              total: total,
              page: page,
              limit: limit,
              totalPages: Math.ceil(total / limit),
            },
          })
        )
      }

      // Obtener transacciones completas del repositorio para tener todos los campos, manteniendo el orden
      const fullTransactions = await transactionRepo.find(
        { id: { $in: transactions.map((t) => t.id) } },
        {
          populate: ['minorista'],
          orderBy: { createdAt: 'DESC', id: 'DESC' }
        }
      )

      console.log(`[API] Refetched ${fullTransactions.length} full transactions`)

      res.json(
        ApiResponse.success({
          transactions: fullTransactions.map((t) => ({
            id: t.id,
            amount: t.amount,
            type: t.type,
            previousAvailableCredit: t.previousAvailableCredit,
            previousBalanceInFavor: t.previousBalanceInFavor,
            currentBalanceInFavor: t.currentBalanceInFavor,
            availableCredit: t.availableCredit,
            currentBalance: t.availableCredit,
            creditConsumed: t.creditConsumed,
            balanceInFavorUsed: t.balanceInFavorUsed,
            creditUsed: t.creditUsed,
            profitEarned: t.profitEarned,
            accumulatedDebt: t.accumulatedDebt,
            accumulatedProfit: t.accumulatedProfit,
            description: t.description,
            createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
          })),
          pagination: {
            total: total,
            page: page,
            limit: limit,
            totalPages: Math.ceil(total / limit),
          },
        })
      )
    } catch (error) {
      console.error('Error fetching transactions:', error)
      res.status(500).json(ApiResponse.serverError())
    }
  }
)

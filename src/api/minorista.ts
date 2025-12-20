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
import { logger } from '@/lib/logger'

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
      creditLimit: result.creditLimit,
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
        logger.error({ error: result.error }, `[API] Error fetching transactions`)
        return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
      }

      const transactions = result.transactions
      const total = result.total

      logger.info(`[API] Found ${transactions.length} transactions (Total: ${total}) for minorista ${minoristaId}`)

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
          orderBy: { createdAt: 'DESC', id: 'DESC' },
        }
      )

      logger.info(`[API] Refetched ${fullTransactions.length} full transactions`)

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
          startBalance: result.startBalance,
          startBalanceInFavor: result.startBalanceInFavor,
          pagination: {
            total: total,
            page: page,
            limit: limit,
            totalPages: Math.ceil(total / limit),
          },
        })
      )
    } catch (error) {
      logger.error({ error }, 'Error fetching transactions')
      res.status(500).json(ApiResponse.serverError())
    }
  }
)

// ------------------ EXPORTAR TRANSACCIONES A CSV ------------------
minoristaRouter.get(
  '/:minoristaId/transactions/export',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINORISTA),
  async (req: Request, res: Response) => {
    const { minoristaId } = req.params
    const user = req.context?.requestUser?.user

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    if (user.role === UserRole.MINORISTA) {
      const minoristaRepo = DI.em.getRepository(Minorista)
      const userMinorista = await minoristaRepo.findOne({ user: user.id })
      if (!userMinorista || userMinorista.id !== minoristaId) {
        return res
          .status(403)
          .json(ApiResponse.forbidden('No tienes permiso para exportar transacciones de otro minorista'))
      }
    }

    try {
      let startDate: string | undefined = undefined
      let endDate: string | undefined = undefined

      if (req.query.startDate) startDate = req.query.startDate as string
      if (req.query.endDate) endDate = req.query.endDate as string

      const result = await minoristaTransactionService.getCombinedExportData(minoristaId, {
        startDate,
        endDate,
      })

      if ('error' in result) {
        return res.status(404).json(ApiResponse.notFound('Minorista', minoristaId))
      }

      // Generate Excel
      const ExcelJS = require('exceljs')
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Transacciones')

      worksheet.columns = [
        { header: 'Fecha', key: 'date', width: 20 },
        { header: 'Tipo', key: 'type', width: 15 },
        { header: 'Descripción', key: 'description', width: 30 },
        { header: 'Monto COP', key: 'amountCOP', width: 15 },
        { header: 'Monto Bs', key: 'amountBs', width: 15 },
        { header: 'Ganancia', key: 'profit', width: 15 },
        { header: 'Neto', key: 'netAmount', width: 15 },
      ]

      // Format Colombia Date
      const formatColDate = (d: Date) => {
        return new Intl.DateTimeFormat('es-CO', {
          timeZone: 'America/Bogota',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(d)
      }

      let totalNet = 0
      let totalAbonos = 0
      let totalGiros = 0
      let totalBs = 0
      let totalProfit = 0

      result.forEach((t) => {
        let netAmount = 0
        if (t.isRecharge) {
          // Abono: Positivo
          netAmount = Number(t.amountCOP)
          totalAbonos += Number(t.amountCOP)
        } else {
          // Giro: Negativo (Monto) + Ganancia (Positiva) = -Cost + Profit
          netAmount = -Number(t.amountCOP) + Number(t.profit)
          totalGiros += Number(t.amountCOP) // Sumamos monto positivo para el totalizador de volumen/giros
        }

        totalNet += netAmount
        totalBs += Number(t.amountBs)
        totalProfit += Number(t.profit)

        worksheet.addRow({
          date: formatColDate(t.date),
          type: t.type,
          description: t.description,
          amountCOP: t.amountCOP,
          amountBs: t.amountBs,
          profit: t.profit,
          netAmount: netAmount,
        })
      })

      // Add Summary Rows
      worksheet.addRow({}) // Empty row

      const summaryStyle = { bold: true }

      worksheet.addRow({ description: 'Total Abonos', amountCOP: totalAbonos }).font = summaryStyle
      worksheet.addRow({ description: 'Total Giros', amountCOP: totalGiros }).font = summaryStyle
      // Total COP: Interpreted as Net Raw Flow (Abonos - Giros) per common accounting, or Volume?
      // Given "Total Neto" is separate, let's provide Net COP (Abonos - Giros)
      worksheet.addRow({ description: 'Total COP (Abonos - Giros)', amountCOP: totalAbonos - totalGiros }).font =
        summaryStyle

      worksheet.addRow({ description: 'Total Bs', amountBs: totalBs }).font = summaryStyle
      worksheet.addRow({ description: 'Total Ganancias', profit: totalProfit }).font = summaryStyle
      worksheet.addRow({ description: 'Total Neto', netAmount: totalNet }).font = summaryStyle
      // format total column as currency if desired (optional)

      // Styling header
      worksheet.getRow(1).font = { bold: true }

      // Fetch Minorista for Filename
      const minoristaRepo = DI.em.getRepository(Minorista)
      const currentMinorista = await minoristaRepo.findOne({ id: minoristaId }, { populate: ['user'] })
      const safeName = currentMinorista ? currentMinorista.user.fullName.replace(/[^a-zA-Z0-9]/g, '_') : minoristaId

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.header('Content-Disposition', `attachment; filename="reporte_${safeName}.xlsx"`)

      const buffer = await workbook.xlsx.writeBuffer()
      res.send(buffer)
    } catch (error) {
      logger.error({ error }, 'Error exporting transactions')
      res.status(500).json(ApiResponse.serverError())
    }
  }
)

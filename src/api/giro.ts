import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createGiroSchema } from '@/schemas/giroSchema'
import { giroService } from '@/services/GiroService'
import { DI } from '@/di'
import { Currency } from '@/entities/Bank'
import { exchangeRateService } from '@/services/ExchangeRateService'
import { GiroStatus } from '@/entities/Giro'

export const giroRouter = express.Router({ mergeParams: true })

// ------------------ CREAR GIRO ------------------
giroRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINORISTA),
  validateBody(createGiroSchema),
  async (req: Request, res: Response) => {
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const { beneficiaryName, beneficiaryId, bankId, accountNumber, phone, amountInput, currencyInput, customRate } =
      req.body

    // VALIDACIÓN 1: Solo SUPER_ADMIN puede usar USD
    if (currencyInput === Currency.USD && user.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json(ApiResponse.forbidden('Solo el SUPER_ADMIN puede enviar dólares'))
    }

    // VALIDACIÓN 2: Solo SUPER_ADMIN puede hacer override de la tasa
    if (customRate && user.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json(ApiResponse.forbidden('Solo el SUPER_ADMIN puede cambiar la tasa del giro'))
    }

    // Determinar minoristaId según rol
    let finalMinoristaId: string | undefined
    if (user.role === UserRole.MINORISTA) {
      // Minorista: buscar el minorista asociado al usuario
      const minorista = await DI.minoristas.findOne({ user: user.id })
      if (!minorista) {
        return res.status(400).json(ApiResponse.notFound('Minorista'))
      }
      finalMinoristaId = minorista.id
    }
    // Admin/SuperAdmin: NO requieren minoristaId
    // El giro se asignará directamente a un transferencista y el dinero saldrá de su cuenta

    // Obtener la tasa de cambio (customRate o tasa del día)
    let rateApplied
    if (customRate) {
      // SUPER_ADMIN hizo override: crear ExchangeRate temporal con valores custom
      const customExchangeRate = await exchangeRateService.createExchangeRate({
        buyRate: customRate.buyRate,
        sellRate: customRate.sellRate,
        usd: customRate.usd,
        bcv: customRate.bcv,
        createdBy: user,
        isCustom: true, // Marcar como tasa personalizada para este giro
      })
      rateApplied = customExchangeRate
    } else {
      // Usar la tasa del día (última creada)
      const currentRateResult = await exchangeRateService.getCurrentRate()
      if ('error' in currentRateResult) {
        return res
          .status(404)
          .json(ApiResponse.notFound('No hay tasa de cambio configurada para hoy. Contacte al administrador.'))
      }
      rateApplied = currentRateResult
    }

    // Calcular amountBs basado en la moneda y la tasa
    let amountBs: number
    if (currencyInput === Currency.USD) {
      // USD → Bs: amountInput * bcv
      amountBs = amountInput * rateApplied.bcv
    } else if (currencyInput === Currency.COP) {
      // COP → Bs: amountInput / sellRate
      amountBs = amountInput / rateApplied.sellRate
    
    } else {
      // VES (bolivares directos)
      amountBs = amountInput
    }

    const result = await giroService.createGiro(
      {
        minoristaId: finalMinoristaId,
        beneficiaryName,
        beneficiaryId,
        bankId,
        accountNumber,
        phone,
        amountInput,
        currencyInput,
        amountBs,
        rateApplied,
      },
      user
    )

    if ('error' in result) {
      switch (result.error) {
        case 'MINORISTA_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Minorista'))
        case 'INSUFFICIENT_BALANCE':
          return res.status(400).json(ApiResponse.badRequest('Balance insuficiente'))
        case 'NO_TRANSFERENCISTA_ASSIGNED':
          return res.status(400).json(ApiResponse.badRequest('No hay transferencista asignado para este banco'))
        case 'BANK_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Banco'))
      }
    }

    res.json(ApiResponse.success({ giro: result, message: 'Giro creado exitosamente' }))
  }
)

// ------------------ LISTAR GIROS ------------------
giroRouter.get('/list', requireAuth(), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const status = req.query.status as GiroStatus | undefined
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 50
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined

  const result = await giroService.listGiros({
    userId: user.id,
    userRole: user.role,
    status,
    dateFrom,
    dateTo,
    page,
    limit,
  })

  res.json(
    ApiResponse.success({
      giros: result.giros,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    })
  )
})

// ------------------ OBTENER GIRO ------------------
giroRouter.get('/:giroId', requireAuth(), async (req: Request, res: Response) => {
  const { giroId } = req.params
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const result = await giroService.getGiroById(giroId, user.id, user.role)

  if ('error' in result) {
    switch (result.error) {
      case 'GIRO_NOT_FOUND':
        return res.status(404).json(ApiResponse.notFound('Giro', giroId))
      case 'UNAUTHORIZED':
        return res.status(403).json(ApiResponse.forbidden('No tienes permisos para ver este giro'))
    }
  }

  res.json(ApiResponse.success({ giro: result }))
})

// ------------------ MARCAR GIRO COMO PROCESANDO ------------------
giroRouter.post(
  '/:giroId/mark-processing',
  requireRole(UserRole.TRANSFERENCISTA),
  async (req: Request, res: Response) => {
    const { giroId } = req.params

    const result = await giroService.markAsProcessing(giroId)

    if ('error' in result) {
      switch (result.error) {
        case 'GIRO_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Giro', giroId))
        case 'INVALID_STATUS':
          return res.status(400).json(ApiResponse.badRequest('El giro no está en estado válido para ser procesado'))
      }
    }

    res.json(ApiResponse.success({ giro: result, message: 'Giro marcado como procesando' }))
  }
)

// ------------------ EJECUTAR GIRO ------------------
giroRouter.post('/:giroId/execute', requireRole(UserRole.TRANSFERENCISTA), async (req: Request, res: Response) => {
  const { giroId } = req.params
  const { bankAccountId, executionType, proofUrl } = req.body

  if (!bankAccountId || !executionType) {
    return res.status(400).json(
      ApiResponse.validationError([
        { field: 'bankAccountId', message: 'La cuenta bancaria es requerida' },
        { field: 'executionType', message: 'El tipo de ejecución es requerido' },
      ])
    )
  }

  const result = await giroService.executeGiro(giroId, bankAccountId, executionType, proofUrl)

  if ('error' in result) {
    switch (result.error) {
      case 'GIRO_NOT_FOUND':
        return res.status(404).json(ApiResponse.notFound('Giro', giroId))
      case 'INVALID_STATUS':
        return res.status(400).json(ApiResponse.badRequest('El giro no está en estado válido para ser ejecutado'))
      case 'BANK_ACCOUNT_NOT_FOUND':
        return res.status(404).json(ApiResponse.notFound('Cuenta bancaria', bankAccountId))
      case 'INSUFFICIENT_BALANCE':
        return res.status(400).json(ApiResponse.badRequest('Balance insuficiente en la cuenta bancaria'))
      case 'UNAUTHORIZED_ACCOUNT':
        return res
          .status(403)
          .json(ApiResponse.forbidden('La cuenta bancaria no pertenece al transferencista asignado'))
    }
  }

  res.json(ApiResponse.success({ giro: result, message: 'Giro ejecutado exitosamente' }))
})

// ------------------ CREAR RECARGA ------------------
giroRouter.post(
  '/recharge/create',
  requireRole(UserRole.MINORISTA),
  async (req: Request, res: Response) => {
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const { operatorId, amountBsId, phone, contactoEnvia } = req.body

    if (!operatorId || !amountBsId || !phone || !contactoEnvia) {
      return res.status(400).json(
        ApiResponse.validationError([
          { field: 'operatorId', message: 'El operador es requerido' },
          { field: 'amountBsId', message: 'El monto es requerido' },
          { field: 'phone', message: 'El teléfono es requerido' },
          { field: 'contactoEnvia', message: 'El contacto que envía es requerido' },
        ])
      )
    }

    // Obtener tasa de cambio actual
    const currentRateResult = await exchangeRateService.getCurrentRate()
    if ('error' in currentRateResult) {
      return res
        .status(404)
        .json(ApiResponse.notFound('No hay tasa de cambio configurada. Contacte al administrador.'))
    }

    const result = await giroService.createRecharge(
      {
        operatorId,
        amountBsId,
        phone,
        contactoEnvia,
      },
      user,
      currentRateResult
    )

    if ('error' in result) {
      switch (result.error) {
        case 'MINORISTA_NOT_FOUND':
          return res.status(400).json(ApiResponse.notFound('Minorista'))
        case 'NO_TRANSFERENCISTA_ASSIGNED':
          return res.status(400).json(ApiResponse.badRequest('No hay transferencistas disponibles'))
        case 'INSUFFICIENT_BALANCE':
          return res.status(400).json(ApiResponse.badRequest('Balance insuficiente del minorista'))
        case 'OPERATOR_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Operador', operatorId))
        case 'AMOUNT_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Monto', amountBsId))
      }
    }

    res.status(201).json(ApiResponse.success({ giro: result, message: 'Recarga creada exitosamente' }))
  }
)

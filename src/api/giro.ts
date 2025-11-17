import express, { Request, Response } from 'express'
import multer from 'multer'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createGiroSchema, updateGiroRateSchema } from '@/schemas/giroSchema'
import { giroService } from '@/services/GiroService'
import { DI } from '@/di'
import { Currency } from '@/entities/Bank'
import { exchangeRateService } from '@/services/ExchangeRateService'
import { ExecutionType, GiroStatus, Giro } from '@/entities/Giro'
import { giroSocketManager } from '@/websocket'
import { minioService } from '@/services/MinIOService'
import { MinoristaTransaction } from '@/entities/MinoristaTransaction'

export const giroRouter = express.Router({ mergeParams: true })

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'))
    }
  },
})

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
        executionType: ExecutionType.TRANSFERENCIA,
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

    // Emitir evento de WebSocket
    if (giroSocketManager) {
      giroSocketManager.broadcastGiroCreated(result)
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

// ------------------- GET MINORISTA TRANSACTION FOR GIRO (More specific route - must come before /:giroId) ------------------
giroRouter.get('/:giroId/minorista-transaction', requireAuth(), async (req: Request, res: Response) => {
  const { giroId } = req.params
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  try {
    // First, get the giro to verify user access and check if minorista exists
    const giro = await DI.em.getRepository(Giro).findOne({ id: giroId }, { populate: ['minorista'] })

    if (!giro) {
      return res.status(404).json(ApiResponse.notFound('Giro', giroId))
    }

    // Only minoristas, admins, and super admins can view transaction details
    if (!['MINORISTA', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return res.status(403).json(ApiResponse.forbidden('Tu rol no tiene acceso a esta información'))
    }

    // Get the minorista transaction for this giro
    const transactionRepo = DI.em.getRepository(MinoristaTransaction)
    const transaction = await transactionRepo.findOne({ giro: giroId }, { populate: ['createdBy', 'minorista'] })

    // For minoristas, check if they own the giro
    if (user.role === 'MINORISTA') {
      // Check if the minorista created this giro - either via giro.minorista reference or via transaction
      if (giro.minorista?.id !== user.id && transaction?.minorista?.id !== user.id) {
        return res.status(403).json(ApiResponse.forbidden('No tienes acceso a los detalles de esta transacción'))
      }
    }

    if (!transaction) {
      // No transaction found - this might be a giro created by admin without minorista involved
      return res.json(ApiResponse.success({ transaction: null, message: 'No hay transacción asociada a este giro' }))
    }

    res.json(ApiResponse.success({ transaction }))
  } catch (error: any) {
    console.error('Error fetching minorista transaction:', error)
    res.status(500).json(ApiResponse.serverError('Error al obtener los detalles de la transacción'))
  }
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

// ------------------- UPDATE GIRO ------------------
giroRouter.patch(
  '/:giroId',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINORISTA),
  async (req: Request, res: Response) => {
    const { giroId } = req.params
    const { beneficiaryName, beneficiaryId, bankId, accountNumber, phone } = req.body

    const result = await giroService.updateGiro(giroId, {
      beneficiaryName,
      beneficiaryId,
      bankId,
      accountNumber,
      phone,
    })

    if ('error' in result) {
      switch (result.error) {
        case 'GIRO_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Giro', giroId))
      }
    }

    // Emitir evento de WebSocket
    if (giroSocketManager) {
      giroSocketManager.broadcastGiroUpdated(result, 'beneficiary')
    }

    res.json(ApiResponse.success({ giro: result, message: 'Giro actualizado exitosamente' }))
  }
)

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

    // Emitir evento de WebSocket
    if (giroSocketManager) {
      giroSocketManager.broadcastGiroProcessing(result)
    }

    res.json(ApiResponse.success({ giro: result, message: 'Giro marcado como procesando' }))
  }
)

// ------------------ ACTUALIZAR TASA DEL GIRO ------------------
giroRouter.patch(
  '/:giroId/rate',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(updateGiroRateSchema),
  async (req: Request, res: Response) => {
    const { giroId } = req.params
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const { buyRate, sellRate, usd, bcv } = req.body

    const result = await giroService.updateGiroRate(giroId, { buyRate, sellRate, usd, bcv }, user)

    if ('error' in result) {
      switch (result.error) {
        case 'GIRO_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Giro', giroId))
        case 'INVALID_STATUS':
          return res
            .status(400)
            .json(
              ApiResponse.badRequest(
                'El giro no está en estado válido para actualizar la tasa. Solo giros en estado ASIGNADO o PENDIENTE pueden modificarse.'
              )
            )
      }
    }

    // Emitir evento de WebSocket
    if (giroSocketManager) {
      giroSocketManager.broadcastGiroUpdated(result, 'rate')
    }

    res.json(ApiResponse.success({ giro: result, message: 'Tasa del giro actualizada exitosamente' }))
  }
)

// ------------------ EJECUTAR GIRO ------------------
giroRouter.post('/:giroId/execute', requireRole(UserRole.TRANSFERENCISTA), async (req: Request, res: Response) => {
  const { giroId } = req.params
  const { bankAccountId, executionType, proofUrl, fee } = req.body

  if (!bankAccountId || !executionType) {
    return res.status(400).json(
      ApiResponse.validationError([
        { field: 'bankAccountId', message: 'La cuenta bancaria es requerida' },
        { field: 'executionType', message: 'El tipo de ejecución es requerido' },
      ])
    )
  }

  const result = await giroService.executeGiro(giroId, bankAccountId, executionType, fee)

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

  // Emitir evento de WebSocket
  if (giroSocketManager) {
    giroSocketManager.broadcastGiroExecuted(result)
  }

  res.json(ApiResponse.success({ giro: result, message: 'Giro ejecutado exitosamente' }))
})

giroRouter.post(
  '/:giroId/return',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TRANSFERENCISTA),
  async (req: Request, res: Response) => {
    const { giroId } = req.params
    const { reason } = req.body
    if (!reason) {
      return res
        .status(400)
        .json(
          ApiResponse.validationError([{ field: 'reason', message: 'La razón para devolver el giro es requerida' }])
        )
    }

    const result = await giroService.returnGiro(giroId, reason)

    if ('error' in result) {
      switch (result.error) {
        case 'GIRO_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Giro', giroId))
        case 'INVALID_STATUS':
          return res.status(400).json(ApiResponse.badRequest('El giro no está en estado válido para ser devuelto'))
      }
    }

    // Emitir evento de WebSocket
    if (giroSocketManager) {
      giroSocketManager.broadcastGiroReturned(result, reason)
    }

    res.json(ApiResponse.success({ giro: result, message: 'Giro devuelto exitosamente' }))
  }
)

// ------------------ CREAR RECARGA ------------------
giroRouter.post('/recharge/create', requireRole(UserRole.MINORISTA), async (req: Request, res: Response) => {
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
    return res.status(404).json(ApiResponse.notFound('No hay tasa de cambio configurada. Contacte al administrador.'))
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

  // Emitir evento de WebSocket
  if (giroSocketManager) {
    giroSocketManager.broadcastGiroCreated(result)
  }

  res.status(201).json(ApiResponse.success({ giro: result, message: 'Recarga creada exitosamente' }))
})

// ------------------ CREAR PAGO MÓVIL ------------------
giroRouter.post('/mobile-payment/create', requireRole(UserRole.MINORISTA), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const { cedula, bankId, phone, contactoEnvia, amountCop } = req.body

  if (!cedula || !bankId || !phone || !contactoEnvia || !amountCop) {
    return res.status(400).json(
      ApiResponse.validationError([
        { field: 'cedula', message: 'La cédula es requerida' },
        { field: 'bankId', message: 'El banco es requerido' },
        { field: 'phone', message: 'El teléfono es requerido' },
        { field: 'contactoEnvia', message: 'El contacto que envía es requerido' },
        { field: 'amountCop', message: 'El monto es requerido' },
      ])
    )
  }

  // Obtener tasa de cambio actual
  const currentRateResult = await exchangeRateService.getCurrentRate()
  if ('error' in currentRateResult) {
    return res.status(404).json(ApiResponse.notFound('No hay tasa de cambio configurada. Contacte al administrador.'))
  }

  const result = await giroService.createMobilePayment(
    {
      cedula,
      bankId,
      phone,
      contactoEnvia,
      amountCop: Number(amountCop),
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
      case 'BANK_NOT_FOUND':
        return res.status(404).json(ApiResponse.notFound('Banco', bankId))
    }
  }

  // Emitir evento de WebSocket
  if (giroSocketManager) {
    giroSocketManager.broadcastGiroCreated(result)
  }

  res.status(201).json(ApiResponse.success({ giro: result, message: 'Pago móvil creado exitosamente' }))
})

// ------------------ ELIMINAR GIRO ------------------
giroRouter.delete('/:giroId', requireRole(UserRole.MINORISTA), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const { giroId } = req.params

  try {
    // Obtener el giro
    const giro = await DI.giros.findOne({ id: giroId }, { populate: ['minorista', 'minorista.user'] })

    if (!giro) {
      return res.status(404).json(ApiResponse.notFound('Giro'))
    }

    // Validar que el minorista sea el propietario del giro
    if (!giro.minorista || giro.minorista.user.id !== user.id) {
      return res.status(403).json(ApiResponse.forbidden('No puedes eliminar giros de otros minoristas'))
    }

    // Eliminar el giro
    const result = await giroService.deleteGiro(giroId)

    if ('error' in result) {
      switch (result.error) {
        case 'GIRO_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Giro'))
        case 'INVALID_STATUS':
          return res
            .status(400)
            .json(ApiResponse.badRequest('Solo se pueden eliminar giros en estado PENDIENTE, ASIGNADO o DEVUELTO'))
        case 'UNAUTHORIZED':
          return res.status(403).json(ApiResponse.forbidden())
      }
    }

    // Emitir evento de WebSocket
    if (giroSocketManager) {
      giroSocketManager.broadcastGiroDeleted(giroId)
    }

    res.json(ApiResponse.success({ message: 'Giro eliminado exitosamente' }))
  } catch (error: any) {
    console.error('Error eliminando giro:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

// ------------------ UPLOAD PAYMENT PROOF ------------------
giroRouter.post(
  '/:giroId/payment-proof/upload',
  upload.single('file'),
  requireRole(UserRole.TRANSFERENCISTA),
  async (req: Request & { file?: any }, res: Response) => {
    try {
      const { giroId } = req.params
      const file = req.file
      const user = req.context?.requestUser?.user

      if (!file) {
        return res.status(400).json(ApiResponse.badRequest('No file provided'))
      }

      // Check user context
      if (!user) {
        return res.status(401).json(ApiResponse.unauthorized())
      }

      // Validate file type and size
      const validation = minioService.validateFile(file.buffer, file.mimetype)
      if (!validation.valid) {
        return res.status(400).json(ApiResponse.badRequest(validation.error || 'Invalid file'))
      }

      // Use forked EM to avoid global context issues with multer
      const em = DI.em.fork()

      // Get the giro
      const giro = await em.findOne(Giro, { id: giroId })
      if (!giro) {
        return res.status(404).json(ApiResponse.notFound('Giro', giroId))
      }

      // Delete old payment proof if exists
      if (giro.paymentProofKey) {
        try {
          await minioService.deleteFile(process.env.MINIO_BUCKET_NAME || 'ultrathink', giro.paymentProofKey)
        } catch (error) {
          console.warn('Could not delete old payment proof:', error)
        }
      }

      // Process image: compress, generate thumbnail, add watermark
      const fileExt = file.originalname.split('.').pop() || 'bin'
      const filename = `${giroId}-${Date.now()}.${fileExt}`

      const processedImages = await minioService.processImage(file.buffer, file.mimetype, {
        userId: user.id,
        fullName: user.fullName,
      })

      // Upload processed file to MinIO
      const bucketName = process.env.MINIO_BUCKET_NAME || 'ultrathink'
      const { key: paymentProofKey } = await minioService.uploadProcessedFile(
        bucketName,
        filename,
        processedImages,
        file.mimetype
      )

      // Update giro with payment proof key (store only the key, not the full URL)
      giro.paymentProofKey = paymentProofKey
      await em.persistAndFlush(giro)

      // Generate presigned URL for response
      const presignedUrl = await minioService.getPresignedUrl(bucketName, paymentProofKey)

      res.json(
        ApiResponse.success({
          giro,
          paymentProofUrl: presignedUrl,
          message: 'Payment proof uploaded successfully',
        })
      )
    } catch (error: any) {
      console.error('Error uploading payment proof:', error)
      res.status(500).json(ApiResponse.serverError())
    }
  }
)

// ------------------ GET PAYMENT PROOF URL ------------------
giroRouter.get('/:giroId/payment-proof/download', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { giroId } = req.params
    const user = req.context?.requestUser?.user

    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    // Get the giro
    const giro = await DI.giros.findOne({ id: giroId }, { populate: ['minorista', 'transferencista'] })
    if (!giro) {
      return res.status(404).json(ApiResponse.notFound('Giro', giroId))
    }

    // Verify authorization
    if (user.role === UserRole.MINORISTA && (!giro.minorista || giro.minorista.user.id !== user.id)) {
      return res.status(403).json(ApiResponse.forbidden('No tienes permisos para descargar este soporte'))
    }

    if (user.role === UserRole.TRANSFERENCISTA && (!giro.transferencista || giro.transferencista.user.id !== user.id)) {
      return res.status(403).json(ApiResponse.forbidden('No tienes permisos para descargar este soporte'))
    }

    if (!giro.paymentProofKey) {
      return res.status(404).json(ApiResponse.notFound('Payment proof for this giro'))
    }

    // Generate presigned URL
    const bucketName = process.env.MINIO_BUCKET_NAME || 'ultrathink'
    const presignedUrl = await minioService.getPresignedUrl(bucketName, giro.paymentProofKey, 3600)

    res.json(
      ApiResponse.success({
        paymentProofUrl: presignedUrl,
        filename: giro.paymentProofKey,
      })
    )
  } catch (error: any) {
    console.error('Error getting payment proof URL:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

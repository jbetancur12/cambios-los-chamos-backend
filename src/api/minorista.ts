import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createMinoristaSchema, updateMinoristaBalanceSchema } from '@/schemas/minoristaSchema'
import { UserRole } from '@/entities/User'
import { minoristaService } from '@/services/MinoristaService'

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

  res.json(ApiResponse.success({ minorista: result }))
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

// ------------------ ACTUALIZAR BALANCE ------------------
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

// src/routes/transferencistaRouter.ts
import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createTransferencistaSchema } from '@/schemas/TransferencistaSchema'
import { UserRole } from '@/entities/User'
import { transferencistaService } from '@/services/TransferencistaService'
import { logger } from '@/lib/logger'

export const transferencistaRouter = express.Router()

transferencistaRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(createTransferencistaSchema),
  async (req: Request, res: Response) => {
    const { fullName, email, password, available } = req.body

    try {
      const result = await transferencistaService.createTransferencista({
        fullName,
        email,
        password,
        available,
      })

      res.status(201).json(
        ApiResponse.success({
          data: result,
          message: 'Usuario Transferencista creado exitosamente',
        })
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Email ya registrado')) {
        return res.status(400).json(ApiResponse.validationErrorSingle('email', err.message))
      }
      res.status(500).json(ApiResponse.error('Error al crear transferencista'))
    }
  }
)

transferencistaRouter.get(
  '/list',
  requireAuth(), // solo usuarios autenticados
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 50

      const result = await transferencistaService.listTransferencistas({ page, limit })

      res.json(ApiResponse.success(result))
    } catch {
      res.status(500).json(ApiResponse.error('Error al obtener transferencistas'))
    }
  }
)

// ------------------ CAMBIAR DISPONIBILIDAD ------------------
transferencistaRouter.put(
  '/:id/toggle-availability',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    const { id } = req.params
    const { isAvailable } = req.body

    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json(ApiResponse.badRequest('isAvailable debe ser un booleano'))
    }

    try {
      const result = await transferencistaService.setAvailability(id, isAvailable)

      if ('error' in result) {
        return res.status(404).json(ApiResponse.notFound('Transferencista', id))
      }

      let message = result.available
        ? 'Transferencista marcado como disponible'
        : 'Transferencista marcado como no disponible'

      if (result.girosRedistributed !== undefined && result.girosRedistributed > 0) {
        message += `. ${result.girosRedistributed} giro(s) redistribuido(s) a otros transferencistas`
      }

      if (result.redistributionErrors !== undefined && result.redistributionErrors > 0) {
        message += `. ${result.redistributionErrors} giro(s) no pudieron ser redistribuidos`
      }

      res.json(ApiResponse.success({ data: result, message }))
    } catch (err) {
      logger.error({ err }, 'Error al actualizar disponibilidad')
      res.status(500).json(ApiResponse.error('Error al actualizar disponibilidad'))
    }
  }
)

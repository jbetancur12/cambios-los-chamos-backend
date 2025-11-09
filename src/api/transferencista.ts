// src/routes/transferencistaRouter.ts
import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createTransferencistaSchema } from '@/schemas/TransferencistaSchema'
import { UserRole } from '@/entities/User'
import { transferencistaService } from '@/services/TransferencistaService'

export const transferencistaRouter = express.Router()

transferencistaRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN),
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
    } catch (err: any) {
      if (err.message.includes('Email ya registrado')) {
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
    } catch (err: any) {
      res.status(500).json(ApiResponse.error('Error al obtener transferencistas'))
    }
  }
)

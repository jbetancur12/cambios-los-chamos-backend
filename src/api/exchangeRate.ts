import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createExchangeRateSchema } from '@/schemas/exchangeRateSchema'
import { UserRole } from '@/entities/User'
import { exchangeRateService } from '@/services/ExchangeRateService'

export const exchangeRateRouter = express.Router()

// ------------------ CREAR TASA DE CAMBIO ------------------
exchangeRateRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(createExchangeRateSchema),
  async (req: Request, res: Response) => {
    const { copToBs, usdToBs, bcvValue } = req.body

    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const result = await exchangeRateService.createExchangeRate({
      copToBs,
      usdToBs,
      bcvValue,
      createdBy: user,
    })

    res.status(201).json(
      ApiResponse.success({
        data: result,
        message: 'Tasa de cambio creada exitosamente',
      })
    )
  }
)

// ------------------ OBTENER TASA ACTUAL ------------------
exchangeRateRouter.get('/current', requireAuth(), async (req: Request, res: Response) => {
  const result = await exchangeRateService.getCurrentRate()

  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Tasa de cambio actual'))
  }

  res.json(ApiResponse.success({ rate: result }))
})

// ------------------ LISTAR TASAS ------------------
exchangeRateRouter.get('/list', requireAuth(), async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 50

  const result = await exchangeRateService.listExchangeRates({ page, limit })

  res.json(ApiResponse.success(result))
})

// ------------------ OBTENER TASA POR ID ------------------
exchangeRateRouter.get('/:rateId', requireAuth(), async (req: Request, res: Response) => {
  const { rateId } = req.params

  const result = await exchangeRateService.getExchangeRateById(rateId)

  if ('error' in result) {
    return res.status(404).json(ApiResponse.notFound('Tasa de cambio', rateId))
  }

  res.json(ApiResponse.success({ rate: result }))
})

import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { bankService } from '@/services/Bank'

export const bankRouter = express.Router({ mergeParams: true })

// ------------------ OBTENER TODOS LOS BANCOS ------------------
bankRouter.get('/all', requireAuth(), async (req: Request, res: Response) => {
const user = req.context?.requestUser?.user
    if (!user) {
        return res.status(401).json(ApiResponse.unauthorized())
    }
  const banks = await bankService.getAllBanks()
  res.json(ApiResponse.success({ banks }))
})
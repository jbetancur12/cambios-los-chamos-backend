import { Router, Request, Response } from 'express'
import { DashboardService } from '@/services/DashboardService'
import { requireAuth } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'

const router = Router()
const dashboardService = new DashboardService()

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics based on user role
 */
router.get('/stats', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!req.context?.requestUser) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const stats = await dashboardService.getStats(req.context.requestUser)
    return res.status(200).json(ApiResponse.success(stats))
  } catch (error) {
    return res
      .status(500)
      .json(ApiResponse.serverError(error instanceof Error ? error.message : 'Error al obtener estadísticas'))
  }
})

/**
 * GET /api/dashboard/recent-giros
 * Get recent giros based on user role
 */
router.get('/recent-giros', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!req.context?.requestUser) {
      return res.status(401).json(ApiResponse.unauthorized())
    }
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 5
    const giros = await dashboardService.getRecentGiros(req.context.requestUser, limit)
    return res.status(200).json(ApiResponse.success({ giros }))
  } catch (error) {
    return res
      .status(500)
      .json(ApiResponse.serverError(error instanceof Error ? error.message : 'Error al obtener giros recientes'))
  }
})

export default router

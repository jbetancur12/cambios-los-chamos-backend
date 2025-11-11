import { Router } from 'express'
import { DashboardService } from '../services/DashboardService'
import { requireAuth } from '../middleware/authMiddleware'
import { apiResponse } from '../utils/apiResponse'

const router = Router()
const dashboardService = new DashboardService()

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics based on user role
 */
router.get('/stats', requireAuth(), async (req, res) => {
  try {
    const stats = await dashboardService.getStats(req.context.requestUser)
    return apiResponse.success(res, stats)
  } catch (error) {
    return apiResponse.error(res, error instanceof Error ? error.message : 'Error al obtener estadísticas')
  }
})

export default router

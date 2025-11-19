import { Router, Request, Response } from 'express'
import { requireRole, requireAuth } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { reportService } from '@/services/ReportService'
import { ApiResponse } from '@/lib/apiResponse'
import { DI } from '@/di'

const router = Router()

/**
 * GET /api/reports/system-profit
 * Get system profit report for a date range (SUPER_ADMIN only)
 */
router.get('/system-profit', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const dateFromStr = req.query.dateFrom as string
    const dateToStr = req.query.dateTo as string

    if (!dateFromStr || !dateToStr) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'dateFrom and dateTo are required',
      })
    }

    const dateFrom = new Date(dateFromStr)
    const dateTo = new Date(dateToStr)

    // Validate dates
    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({
        error: 'INVALID_DATE_FORMAT',
        message: 'Invalid date format',
      })
    }

    // Ensure dateTo includes the whole day
    dateTo.setHours(23, 59, 59, 999)

    const report = await reportService.getSystemProfitReport(dateFrom, dateTo)
    res.json(ApiResponse.success(report))
  } catch (error) {
    console.error('Error fetching system profit report:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * GET /api/reports/system-profit-trend
 * Get system profit trend report for a date range (SUPER_ADMIN only)
 */
router.get('/system-profit-trend', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const dateFromStr = req.query.dateFrom as string
    const dateToStr = req.query.dateTo as string

    if (!dateFromStr || !dateToStr) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'dateFrom and dateTo are required',
      })
    }

    const dateFrom = new Date(dateFromStr)
    const dateTo = new Date(dateToStr)

    // Validate dates
    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({
        error: 'INVALID_DATE_FORMAT',
        message: 'Invalid date format',
      })
    }

    // Ensure dateTo includes the whole day
   

    const report = await reportService.getSystemProfitTrendReport(dateFrom, dateTo)
    res.json(ApiResponse.success(report))
  } catch (error) {
    console.error('Error fetching system profit trend report:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * GET /api/reports/minorista-profit
 * Get minorista profit report for a date range (SUPER_ADMIN only)
 */
router.get('/minorista-profit', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const dateFromStr = req.query.dateFrom as string
    const dateToStr = req.query.dateTo as string
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100

    if (!dateFromStr || !dateToStr) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'dateFrom and dateTo are required',
      })
    }

    const dateFrom = new Date(dateFromStr)
    const dateTo = new Date(dateToStr)

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({
        error: 'INVALID_DATE_FORMAT',
        message: 'Invalid date format',
      })
    }

    dateTo.setHours(23, 59, 59, 999)
    const report = await reportService.getMinoristaProfitReport(dateFrom, dateTo, limit)
    res.json(ApiResponse.success(report))
  } catch (error) {
    console.error('Error fetching minorista profit report:', error)
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
  }
})

/**
 * GET /api/reports/bank-transactions
 * Get bank transaction report for a date range (SUPER_ADMIN only)
 */
router.get('/bank-transactions', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const dateFromStr = req.query.dateFrom as string
    const dateToStr = req.query.dateTo as string

    if (!dateFromStr || !dateToStr) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'dateFrom and dateTo are required',
      })
    }

    const dateFrom = new Date(dateFromStr)
    const dateTo = new Date(dateToStr)

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({
        error: 'INVALID_DATE_FORMAT',
        message: 'Invalid date format',
      })
    }

    dateTo.setHours(23, 59, 59, 999)

    const report = await reportService.getBankTransactionReport(dateFrom, dateTo)
    res.json(ApiResponse.success(report))
  } catch (error) {
    console.error('Error fetching bank transaction report:', error)
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
  }
})

/**
 * GET /api/reports/minorista-transactions
 * Get minorista transaction report for a date range (SUPER_ADMIN only)
 */
router.get('/minorista-transactions', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const dateFromStr = req.query.dateFrom as string
    const dateToStr = req.query.dateTo as string

    if (!dateFromStr || !dateToStr) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'dateFrom and dateTo are required',
      })
    }

    const dateFrom = new Date(dateFromStr)
    const dateTo = new Date(dateToStr)

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({
        error: 'INVALID_DATE_FORMAT',
        message: 'Invalid date format',
      })
    }

    dateTo.setHours(23, 59, 59, 999)

    const report = await reportService.getMinoristaTransactionReport(dateFrom, dateTo)
    res.json(ApiResponse.success(report))
  } catch (error) {
    console.error('Error fetching minorista transaction report:', error)
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
  }
})

/**
 * GET /api/reports/minorista/giros
 * Get minorista giro report for a date range (MINORISTA only - sees own data)
 */
router.get('/minorista/giros', requireAuth(), async (req: Request, res: Response) => {
  try {
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    if (user.role !== UserRole.MINORISTA) {
      return res.status(403).json(ApiResponse.forbidden('Solo minoristas pueden ver este reporte'))
    }

    const dateFromStr = req.query.dateFrom as string
    const dateToStr = req.query.dateTo as string

    if (!dateFromStr || !dateToStr) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'dateFrom and dateTo are required',
      })
    }

    const dateFrom = new Date(dateFromStr)
    const dateTo = new Date(dateToStr)

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({
        error: 'INVALID_DATE_FORMAT',
        message: 'Invalid date format',
      })
    }

    dateTo.setHours(23, 59, 59, 999)

    // Get minorista id for this user
    const minorista = await DI.minoristas.findOne({ user: user.id })
    if (!minorista) {
      return res.status(404).json(ApiResponse.notFound('Minorista'))
    }

    const report = await reportService.getMinoristaGiroReport(minorista.id, dateFrom, dateTo)
    res.json(ApiResponse.success(report))
  } catch (error) {
    console.error('Error fetching minorista giro report:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * GET /api/reports/minorista/giros-trend
 * Get minorista giro trend report for a date range (MINORISTA only - sees own data)
 */
router.get('/minorista/giros-trend', requireAuth(), async (req: Request, res: Response) => {
  try {
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    if (user.role !== UserRole.MINORISTA) {
      return res.status(403).json(ApiResponse.forbidden('Solo minoristas pueden ver este reporte'))
    }

    const dateFromStr = req.query.dateFrom as string
    const dateToStr = req.query.dateTo as string

    if (!dateFromStr || !dateToStr) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'dateFrom and dateTo are required',
      })
    }

    const dateFrom = new Date(dateFromStr)
    const dateTo = new Date(dateToStr)

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({
        error: 'INVALID_DATE_FORMAT',
        message: 'Invalid date format',
      })
    }

    dateTo.setHours(23, 59, 59, 999)

    // Get minorista id for this user
    const minorista = await DI.minoristas.findOne({ user: user.id })
    if (!minorista) {
      return res.status(404).json(ApiResponse.notFound('Minorista'))
    }

    const report = await reportService.getMinoristaGiroTrendReport(minorista.id, dateFrom, dateTo)
    res.json(ApiResponse.success(report))
  } catch (error) {
    console.error('Error fetching minorista giro trend report:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

export default router

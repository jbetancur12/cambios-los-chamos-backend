import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { DI } from '@/di'
import { ApiResponse } from '@/lib/apiResponse'
import { RechargeOperator } from '@/entities/RechargeOperator'

const router = Router()

/**
 * GET /api/recharge-operators
 * Get all active recharge operators
 */
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const operators = await DI.rechargeOperators.find({ isActive: true })
    res.json(ApiResponse.success(operators))
  } catch (error) {
    console.error('Error fetching recharge operators:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * GET /api/recharge-operators/all
 * Get all recharge operators (including inactive) - SUPER_ADMIN only
 */
router.get('/all', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const operators = await DI.rechargeOperators.findAll()
    res.json(ApiResponse.success(operators))
  } catch (error) {
    console.error('Error fetching all recharge operators:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * POST /api/recharge-operators
 * Create a new recharge operator - SUPER_ADMIN only
 */
router.post('/', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const { name, type } = req.body

    if (!name || !type) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'name and type are required',
      })
    }

    const operator = new RechargeOperator()
    operator.name = name
    operator.type = type

    await DI.em.persistAndFlush(operator)
    res.status(201).json(ApiResponse.success(operator))
  } catch (error) {
    console.error('Error creating recharge operator:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * PUT /api/recharge-operators/:id
 * Update a recharge operator - SUPER_ADMIN only
 */
router.put('/:id', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, type, isActive } = req.body

    const operator = await DI.rechargeOperators.findOne({ id })
    if (!operator) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Operator not found',
      })
    }

    if (name) operator.name = name
    if (type) operator.type = type
    if (typeof isActive === 'boolean') operator.isActive = isActive

    await DI.em.persistAndFlush(operator)
    res.json(ApiResponse.success(operator))
  } catch (error) {
    console.error('Error updating recharge operator:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * DELETE /api/recharge-operators/:id
 * Soft delete a recharge operator - SUPER_ADMIN only
 */
router.delete('/:id', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const operator = await DI.rechargeOperators.findOne({ id })
    if (!operator) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Operator not found',
      })
    }

    operator.isActive = false
    await DI.em.persistAndFlush(operator)

    res.json(ApiResponse.success({ message: 'Operator deactivated' }))
  } catch (error) {
    console.error('Error deleting recharge operator:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

export default router

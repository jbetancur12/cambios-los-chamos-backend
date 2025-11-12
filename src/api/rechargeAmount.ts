import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { DI } from '@/di'
import { ApiResponse } from '@/lib/apiResponse'
import { RechargeAmount } from '@/entities/RechargeAmount'
import { RequestContext } from '@mikro-orm/postgresql'

const router = Router()

/**
 * GET /api/recharge-amounts
 * Get all active recharge amounts
 */
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const amounts = await DI.rechargeAmounts.find({ isActive: true }, { orderBy: { amountBs: 'ASC' } })
    res.json(ApiResponse.success(amounts))
  } catch (error) {
    console.error('Error fetching recharge amounts:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * GET /api/recharge-amounts/all
 * Get all recharge amounts (including inactive) - SUPER_ADMIN only
 */
router.get('/all', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const amounts = await DI.rechargeAmounts.findAll({ orderBy: { amountBs: 'ASC' } })
    res.json(ApiResponse.success(amounts))
  } catch (error) {
    console.error('Error fetching all recharge amounts:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * POST /api/recharge-amounts
 * Create a new recharge amount - SUPER_ADMIN only
 */
router.post('/', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const { amountBs } = req.body

    if (!amountBs || typeof amountBs !== 'number' || amountBs <= 0) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'amountBs is required and must be a positive number',
      })
    }

    const amount = new RechargeAmount()
    amount.amountBs = amountBs
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'User not found in request context',
      })
    }
    amount.createdBy = user

    await DI.em.persistAndFlush(amount)
    res.status(201).json(ApiResponse.success(amount))
  } catch (error) {
    console.error('Error creating recharge amount:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * PUT /api/recharge-amounts/:id
 * Update a recharge amount - SUPER_ADMIN only
 */
router.put('/:id', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { amountBs, isActive } = req.body

    const amount = await DI.rechargeAmounts.findOne({ id })
    if (!amount) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Recharge amount not found',
      })
    }

    if (amountBs && typeof amountBs === 'number' && amountBs > 0) {
      amount.amountBs = amountBs
    }

    if (typeof isActive === 'boolean') {
      amount.isActive = isActive
    }

    await DI.em.persistAndFlush(amount)
    res.json(ApiResponse.success(amount))
  } catch (error) {
    console.error('Error updating recharge amount:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * DELETE /api/recharge-amounts/:id
 * Soft delete a recharge amount - SUPER_ADMIN only
 */
router.delete('/:id', requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const amount = await DI.rechargeAmounts.findOne({ id })
    if (!amount) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Recharge amount not found',
      })
    }

    amount.isActive = false
    await DI.em.persistAndFlush(amount)

    res.json(ApiResponse.success({ message: 'Recharge amount deactivated' }))
  } catch (error) {
    console.error('Error deleting recharge amount:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

export default router

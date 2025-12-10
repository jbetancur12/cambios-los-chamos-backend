import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { DI } from '@/di'
import { ApiResponse } from '@/lib/apiResponse'
import { operatorAmountService } from '@/services/OperatorAmountService'

const router = Router()

/**
 * GET /api/operator-amounts/:operatorId
 * Get all amounts for a specific operator (active only)
 */
router.get('/:operatorId', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { operatorId } = req.params

    const operator = await DI.rechargeOperators.findOne({ id: operatorId })
    if (!operator) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Operator not found',
      })
    }

    const amounts = await operatorAmountService.getAmountsByOperator(operatorId)
    res.json(ApiResponse.success(amounts))
  } catch (error) {
    console.error('Error fetching operator amounts:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

/**
 * GET /api/operator-amounts/:operatorId/all
 * Get all amounts for a specific operator (including inactive) - Restricted roles
 */
router.get(
  '/:operatorId/all',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TRANSFERENCISTA),
  async (req: Request, res: Response) => {
    try {
      const { operatorId } = req.params

      const operator = await DI.rechargeOperators.findOne({ id: operatorId })
      if (!operator) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Operator not found',
        })
      }

      const amounts = await operatorAmountService.getAllAmountsByOperator(operatorId)
      res.json(ApiResponse.success(amounts))
    } catch (error) {
      console.error('Error fetching all operator amounts:', error)
      res.status(500).json(ApiResponse.serverError())
    }
  }
)

/**
 * POST /api/operator-amounts
 * Create a new operator-amount relation - Restricted roles
 */
router.post(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TRANSFERENCISTA),
  async (req: Request, res: Response) => {
    try {
      const { operatorId, amountId } = req.body

      if (!operatorId || !amountId) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'operatorId and amountId are required',
        })
      }

      const operator = await DI.rechargeOperators.findOne({ id: operatorId })
      if (!operator) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Operator not found',
        })
      }

      const amount = await DI.rechargeAmounts.findOne({ id: amountId })
      if (!amount) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Amount not found',
        })
      }

      // Check if relation already exists
      const existing = await DI.operatorAmounts.findOne({
        operator: { id: operatorId },
        amount: { id: amountId },
      })

      if (existing) {
        return res.status(409).json({
          error: 'CONFLICT',
          message: 'This operator-amount relation already exists',
        })
      }

      const operatorAmount = await operatorAmountService.createOperatorAmount(operatorId, amountId)
      res.status(201).json(ApiResponse.success(operatorAmount))
    } catch (error) {
      console.error('Error creating operator-amount relation:', error)
      res.status(500).json(ApiResponse.serverError())
    }
  }
)

/**
 * DELETE /api/operator-amounts/:id
 * Delete an operator-amount relation completely - Restricted roles
 */
router.delete(
  '/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TRANSFERENCISTA),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params

      const operatorAmount = await DI.operatorAmounts.findOne({ id })
      if (!operatorAmount) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Operator-amount relation not found',
        })
      }

      await operatorAmountService.deleteOperatorAmount(id)
      res.json(ApiResponse.success({ message: 'Operator-amount relation deleted' }))
    } catch (error) {
      console.error('Error deleting operator-amount relation:', error)
      res.status(500).json(ApiResponse.serverError())
    }
  }
)

export default router

import express, { Request, Response } from 'express'
import { requireAuth } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { beneficiarySuggestionService } from '@/services/BeneficiarySuggestionService'
import { ExecutionType } from '@/entities/Giro'

export const beneficiarySuggestionRouter = express.Router({ mergeParams: true })

// Save beneficiary suggestion
beneficiarySuggestionRouter.post('/save', requireAuth(), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const { beneficiaryName, beneficiaryId, phone, bankId, accountNumber, executionType } = req.body

  const isMobilePayment = executionType === ExecutionType.PAGO_MOVIL
  const missingAccountNumber = !isMobilePayment && !accountNumber

  if (!beneficiaryName || !beneficiaryId || !bankId || missingAccountNumber) {
    const errors = []
    if (!beneficiaryName) errors.push({ field: 'beneficiaryName', message: 'Nombre es requerido' })
    if (!beneficiaryId) errors.push({ field: 'beneficiaryId', message: 'Cédula es requerida' })
    if (!bankId) errors.push({ field: 'bankId', message: 'Banco es requerido' })
    if (missingAccountNumber) errors.push({ field: 'accountNumber', message: 'Cuenta es requerida' })

    return res.status(400).json(ApiResponse.validationError(errors))
  }

  const type = (executionType as ExecutionType) || ExecutionType.TRANSFERENCIA

  try {
    const suggestion = await beneficiarySuggestionService.saveBeneficiarySuggestion(user.id, {
      beneficiaryName,
      beneficiaryId,
      phone,
      bankId,
      accountNumber,
      executionType: type,
    })

    res.json(ApiResponse.success({ suggestion, message: 'Beneficiario guardado exitosamente' }))
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      return res.status(404).json(ApiResponse.notFound('Usuario'))
    }
    console.error('Error saving beneficiary suggestion:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

// Search beneficiary suggestions
beneficiarySuggestionRouter.get('/search', requireAuth(), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const searchTerm = (req.query.q as string) || ''
  const limit = parseInt(req.query.limit as string) || 20
  const executionType = (req.query.executionType as ExecutionType) || undefined

  try {
    const suggestions = await beneficiarySuggestionService.searchBeneficiarySuggestions(
      user.id,
      searchTerm,
      executionType,
      limit
    )

    res.json(ApiResponse.success({ suggestions }))
  } catch (error) {
    console.error('Error searching beneficiary suggestions:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

// Get all beneficiary suggestions
beneficiarySuggestionRouter.get('/list', requireAuth(), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const limit = parseInt(req.query.limit as string) || 50
  const executionType = (req.query.executionType as ExecutionType) || undefined

  try {
    const suggestions = await beneficiarySuggestionService.getBeneficiarySuggestions(user.id, executionType, limit)

    res.json(ApiResponse.success({ suggestions }))
  } catch (error) {
    console.error('Error fetching beneficiary suggestions:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

// Delete beneficiary suggestion
beneficiarySuggestionRouter.delete('/:suggestionId', requireAuth(), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const { suggestionId } = req.params

  try {
    const deleted = await beneficiarySuggestionService.deleteBeneficiarySuggestion(user.id, suggestionId)

    if (!deleted) {
      return res.status(404).json(ApiResponse.notFound('Beneficiario'))
    }

    res.json(ApiResponse.success({ message: 'Beneficiario eliminado exitosamente' }))
  } catch (error) {
    console.error('Error deleting beneficiary suggestion:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

// Delete all beneficiary suggestions
beneficiarySuggestionRouter.delete('/', requireAuth(), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  try {
    const count = await beneficiarySuggestionService.deleteAllBeneficiarySuggestions(user.id)

    res.json(ApiResponse.success({ count, message: 'Todos los beneficiarios han sido eliminados' }))
  } catch (error) {
    console.error('Error deleting all beneficiary suggestions:', error)
    res.status(500).json(ApiResponse.serverError())
  }
})

import express, { Request, Response } from 'express'
import { requireRole } from '@/middleware/authMiddleware'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createBankAssignmentSchema, updatePrioritySchema } from '@/schemas/bankAssignmentSchema'
import { UserRole } from '@/entities/User'
import { bankAssignmentService } from '@/services/BankAssignmentService'

export const bankAssignmentRouter = express.Router()

// ------------------ CREAR ASIGNACIÓN DE BANCO ------------------
bankAssignmentRouter.post(
  '/create',
  requireRole(UserRole.SUPER_ADMIN),
  validateBody(createBankAssignmentSchema),
  async (req: Request, res: Response) => {
    const { bankId, transferencistaId, priority } = req.body

    const result = await bankAssignmentService.createBankAssignment({
      bankId,
      transferencistaId,
      priority,
    })

    if ('error' in result) {
      switch (result.error) {
        case 'BANK_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Banco'))
        case 'TRANSFERENCISTA_NOT_FOUND':
          return res.status(404).json(ApiResponse.notFound('Transferencista'))
      }
    }

    res.status(201).json(ApiResponse.success({ bankAssignment: result, message: 'Asignación creada exitosamente' }))
  }
)

// ------------------ LISTAR TODAS LAS ASIGNACIONES ------------------
bankAssignmentRouter.get(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    const activeOnly = req.query.activeOnly === 'true'

    const assignments = await bankAssignmentService.listBankAssignments(activeOnly)

    res.json(ApiResponse.success({ assignments }))
  }
)

// ------------------ OBTENER ASIGNACIONES POR BANCO ------------------
bankAssignmentRouter.get(
  '/by-bank/:bankId',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    const { bankId } = req.params

    const result = await bankAssignmentService.getAssignmentsByBank(bankId)

    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Banco'))
    }

    res.json(ApiResponse.success({ assignments: result }))
  }
)

// ------------------ OBTENER ASIGNACIONES POR TRANSFERENCISTA ------------------
bankAssignmentRouter.get(
  '/by-transferencista/:transferencistaId',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    const { transferencistaId } = req.params

    const result = await bankAssignmentService.getAssignmentsByTransferencista(transferencistaId)

    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Transferencista'))
    }

    res.json(ApiResponse.success({ assignments: result }))
  }
)

// ------------------ ACTUALIZAR PRIORIDAD ------------------
bankAssignmentRouter.patch(
  '/:assignmentId/priority',
  requireRole(UserRole.SUPER_ADMIN),
  validateBody(updatePrioritySchema),
  async (req: Request, res: Response) => {
    const { assignmentId } = req.params
    const { priority } = req.body

    const result = await bankAssignmentService.updatePriority(assignmentId, priority)

    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Asignación', assignmentId))
    }

    res.json(ApiResponse.success({ assignment: result, message: 'Prioridad actualizada exitosamente' }))
  }
)

// ------------------ ACTIVAR/DESACTIVAR ASIGNACIÓN ------------------
bankAssignmentRouter.patch(
  '/:assignmentId/toggle-active',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const { assignmentId } = req.params

    const result = await bankAssignmentService.toggleActive(assignmentId)

    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Asignación', assignmentId))
    }

    res.json(
      ApiResponse.success({
        assignment: result,
        message: `Asignación ${result.isActive ? 'activada' : 'desactivada'} exitosamente`,
      })
    )
  }
)

// ------------------ ELIMINAR ASIGNACIÓN ------------------
bankAssignmentRouter.delete(
  '/:assignmentId',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const { assignmentId } = req.params

    const result = await bankAssignmentService.deleteAssignment(assignmentId)

    if ('error' in result) {
      return res.status(404).json(ApiResponse.notFound('Asignación', assignmentId))
    }

    res.json(ApiResponse.success({ message: 'Asignación eliminada exitosamente' }))
  }
)

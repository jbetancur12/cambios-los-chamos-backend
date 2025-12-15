import express, { Request, Response } from 'express'
import { requireRole } from '@/middleware/authMiddleware'
import { UserRole, User } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { auditService } from '@/services/AuditService'
import { DI } from '@/di'

export const auditRouter = express.Router()

// GET /audit?email=...
// If email provided, audits that user.
// If no email, audits ALL users (summary only potentially? No, full list).
auditRouter.get(
    '/',
    requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
    async (req: Request, res: Response) => {
        try {
            const { email, date } = req.query

            if (email) {
                const user = await DI.users.findOne({ email: email as string }, { populate: ['minorista'] })
                if (!user || !user.minorista) {
                    return res.status(404).json(ApiResponse.notFound('Minorista not found'))
                }
                const result = await auditService.auditMinorista(user.minorista.id, date as string)
                return res.json(ApiResponse.success(result))
            } else {
                const results = await auditService.auditAll()
                return res.json(ApiResponse.success(results))
            }
        } catch (error) {
            console.error('Audit error:', error)
            return res.status(500).json(ApiResponse.serverError())
        }
    }
)

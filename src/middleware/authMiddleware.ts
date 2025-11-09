import { Request, Response, NextFunction } from 'express'
import { DI } from '@/di'
import { UserRole } from '@/entities/User'
import { Giro } from '@/entities/Giro'
import { ApiResponse } from '@/lib/apiResponse'

/**
 * Verifica que el usuario esté autenticado
 */
export const requireAuth = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (
      !req.context ||
      !req.context.requestUser ||
      req.context.requestUser.type === 'unauthenticatedUser'
    ) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    return next()
  }
}

/**
 * Requiere que el usuario tenga uno o más roles específicos
 */

export const requireRole = (...roles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestUser = req.context?.requestUser

    if (!requestUser || !requestUser.user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const user = requestUser.user

    if (!roles.includes(user.role)) {
      return res.status(403).json(
        ApiResponse.forbidden(`Requiere rol: ${roles.join(', ')}`)
      )
    }

    return next()
  }
}


/**
 * Valida que el usuario tenga permiso sobre un giro
 * - El super admin y admin pueden ver todos
 * - El minorista solo sus giros
 * - El transferencista solo los que le fueron asignados
 */
export const requireGiroAccess = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const giroIdParam = req.params.giroId || req.query.giroId as string
    const giroId = parseInt(giroIdParam)

    // Validar que giroId sea un número válido
    if (!giroIdParam || isNaN(giroId)) {
      return res.status(400).json(
        ApiResponse.validationErrorSingle('giroId', 'Giro ID es requerido y debe ser un número válido')
      )
    }

    try {
      const giroRepo = DI.em.getRepository(Giro)
      const giro = await giroRepo.findOne(
        { id: giroId.toString() },
        { populate: ['minorista.user', 'transferencista.user'] }
      )

      if (!giro) {
        return res.status(404).json(ApiResponse.notFound('Giro', giroId))
      }

      // Permisos según rol
      if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
        return next()
      }

      if (
        user.role === UserRole.MINORISTA &&
        giro.minorista?.user.id === user.id
      ) {
        return next()
      }

      if (
        user.role === UserRole.TRANSFERENCISTA &&
        giro.transferencista?.user.id === user.id
      ) {
        return next()
      }

      return res.status(403).json(ApiResponse.forbidden('No tienes acceso a este giro'))
    } catch (err) {
      console.error('Error in requireGiroAccess:', err)
      return res.status(500).json(ApiResponse.serverError())
    }
  }
}

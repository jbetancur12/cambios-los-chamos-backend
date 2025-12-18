import { Request, Response, NextFunction } from 'express'
import { DI } from '@/di' // Dependency Injector que contiene entityManager y repos
import { verifyAccessToken } from '@/lib/tokenUtils'
import { RequestUser } from '@/middleware/requestUser'
import { User } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { logger } from '@/lib/logger'

export const userMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Valor por defecto: usuario no autenticado
    req.context = {
      requestUser: new RequestUser(null, 'unauthenticatedUser', null),
    }
    const accessToken = req.cookies?.accessToken
    const authHeader = req.headers.authorization

    let token = accessToken
    if (!token && authHeader) {
      const match = authHeader.match(/^(?:Token|Bearer)\s+(\S+)$/i)
      if (match) {
        token = match[1]
      }
    }

    // Debug logging
    if (!token) {
      logger.debug({ cookies: Object.keys(req.cookies || {}), hasAuthHeader: !!authHeader }, '[AUTH] No token found')
      return next()
    }

    logger.debug({ source: accessToken ? 'cookie' : 'authHeader' }, '[AUTH] Token found')

    try {
      // 2️⃣ Verificar token y decodificar información
      const decoded = verifyAccessToken(token)
      if (!decoded) {
        return next()
      }

      // 3️⃣ Buscar el usuario en BD
      const userRepo = DI.em.getRepository(User)
      const user = await userRepo.findOne(
        { email: decoded.email },
        {
          populate: ['minorista', 'transferencista'],
        }
      )

      if (!user) {
        return next()
      }

      if (!user.isActive) {
        logger.warn({ email: user.email }, '[AUTH] Token valid but user is inactive')
        return next()
      }

      // 4️⃣ Construir objeto requestUser
      req.context.requestUser = new RequestUser(user, 'authenticatedUser', null)

      // Ejemplo: puedes inyectar directamente el rol o ID del minorista
      req.context.role = user.role
      req.context.userId = user.id

      return next()
    } catch (err) {
      logger.error({ err }, 'Error verifying token')
      return res.status(401).json(ApiResponse.invalidToken())
    }
  }
}

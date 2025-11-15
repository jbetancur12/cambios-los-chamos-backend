import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { ErrorCode } from '@/types/ApiResponse'
import { validateBody } from '@/lib/zodUtils'
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  sendResetPasswordSchema,
  resetPasswordSchema,
  getByRoleSchema,
} from '@/schemas/userSchemas'
import { userService } from '@/services/UserService'
import { validateParams } from '@/lib/validateParams'

export const userRouter = express.Router({ mergeParams: true })

// ------------------ LOGIN ------------------
userRouter.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body

  try {
    const result = await userService.login(email, password)

    if (!result) {
      return res.status(401).json(ApiResponse.unauthorized('Credenciales inválidas'))
    }

    const { user, token: accessToken } = result

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
      path: '/',
    })

    res.json(
      ApiResponse.success({
        message: 'Inicio de sesión exitoso',
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      })
    )
  } catch (error: any) {
    // Capturar error de correo no verificado
    if (error?.message?.includes('no ha sido verificado')) {
      return res.status(403).json(ApiResponse.error(error.message, ErrorCode.EMAIL_NOT_VERIFIED))
    }
    // Cualquier otro error
    console.error('Error en login:', error)
    return res.status(500).json(ApiResponse.serverError())
  }
})

// ------------------ LOGOUT ------------------
userRouter.post('/logout', requireAuth(), async (_req: Request, res: Response) => {
  res.clearCookie('accessToken')
  res.json(ApiResponse.success({ message: 'Sesión cerrada correctamente' }))
})

// ------------------ REGISTRO ------------------
userRouter.post(
  '/register',
  requireRole(UserRole.SUPER_ADMIN),
  validateBody(registerSchema),
  async (req: Request, res: Response) => {
    const { email, password, fullName, role } = req.body

    const result = await userService.register({ email, password, fullName, role })

    if ('error' in result) {
      return res
        .status(409)
        .json(ApiResponse.conflict('Ya existe un usuario con este email', { field: 'email', value: email }))
    }

    const { user } = result

    // Nota: NO creamos una cookie para el nuevo usuario
    // El SuperAdmin mantiene su sesión actual
    // El nuevo usuario podrá iniciar sesión después con sus credenciales

    res.status(201).json(
      ApiResponse.success({
        message: 'Usuario creado exitosamente',
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      })
    )
  }
)

// ------------------ CAMBIAR CONTRASEÑA ------------------
userRouter.post(
  '/change-password',
  requireAuth(),
  validateBody(changePasswordSchema),
  async (req: Request, res: Response) => {
    const user = req.context?.requestUser?.user
    if (!user) {
      return res.status(401).json(ApiResponse.unauthorized())
    }

    const { oldPassword, newPassword } = req.body

    const success = await userService.changePassword(user, oldPassword, newPassword)

    if (!success) {
      return res.status(400).json(ApiResponse.badRequest('Contraseña actual incorrecta'))
    }

    res.json(ApiResponse.success({ message: 'Contraseña cambiada exitosamente' }))
  }
)

// ------------------ DETALLES DEL USUARIO ------------------
userRouter.get('/me', requireAuth(), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  res.json(
    ApiResponse.success({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    })
  )
})

export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body

  const success = await userService.resetPassword(token, newPassword)

  if (!success) {
    return res.status(400).json(ApiResponse.invalidToken())
  }

  return res.json(ApiResponse.success({ message: 'Contraseña restablecida exitosamente' }))
}

// ------------------ RESTABLECER CONTRASEÑA ------------------
userRouter.post('/reset-password', validateBody(resetPasswordSchema), resetPassword)

// ------------------ ENVIAR CORREO DE RESTABLECIMIENTO DE CONTRASEÑA ------------------
userRouter.post('/send-reset-password', validateBody(sendResetPasswordSchema), async (req: Request, res: Response) => {
  const { email } = req.body

  try {
    await userService.sendResetPasswordEmail(email)

    return res.status(200).json(
      ApiResponse.success({
        message: 'Si el email existe, se ha enviado un enlace de restablecimiento.',
      })
    )
  } catch (err) {
    console.error(err)
    return res.status(500).json(ApiResponse.serverError())
  }
})

// ------------------ OBTENER POR ROL ------------------
userRouter.get(
  '/by-role/:role',
  requireAuth(),
  requireRole(UserRole.SUPER_ADMIN),
  validateParams(getByRoleSchema),
  async (req: Request, res: Response) => {
    const { role } = req.params as { role: UserRole }

    try {
      const users = await userService.getUsersByRole(role)
      const usersResponse = users.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
      }))
      res.json(ApiResponse.success({ users: usersResponse }))
    } catch (err: any) {
      res.status(500).json(ApiResponse.error('Error al obtener usuarios por rol'))
    }
  }
)

// ------------------ ACTIVAR / DESACTIVAR USUARIO ------------------
userRouter.put(
  '/:userId/toggle-active',
  requireAuth(),
  requireRole(UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const { userId } = req.params

    try {
      const user = await userService.toggleUserActiveStatus(userId)
      if (!user) {
        return res.status(404).json(ApiResponse.notFound('Usuario no encontrado'))
      }

      res.json(
        ApiResponse.success({
          message: `Usuario ${user.isActive ? 'activado' : 'desactivado'} exitosamente`,
          user: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
          },
        })
      )
    } catch (err: any) {
      res.status(500).json(ApiResponse.error('Error al cambiar el estado del usuario'))
    }
  }
)

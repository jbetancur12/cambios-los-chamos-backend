import express, { Request, Response } from 'express'
import { DI } from '@/di'
import { User } from '@/entities/User'
import { sendEmail } from '@/lib/emailUtils'
import { createUserToken, markTokenUsed, validateUserToken } from '@/lib/userTokenUtils'
import { TokenType } from '@/entities/UserToken'
import { makePassword } from '@/lib/passwordUtils'
import { ApiResponse } from '@/lib/apiResponse'

/**
 * Envía un correo de verificación con un enlace que incluye un token firmado.
 */

export async function sendVerificationEmail(user: User): Promise<void> {
  const record = await createUserToken(user, TokenType.EMAIL_VERIFICATION, 10)
  const link = `${process.env.FRONTEND_URL || 'https://tuservidor.com'}/api/email_verification/confirm?token=${record.token}`

  await sendEmail(
    user.email,
    'Activa tu cuenta - Sistema de Giros',
    `
      <h2>Verifica tu correo electrónico</h2>
      <p>Haz clic en el siguiente enlace para activar tu cuenta:</p>
      <a href="${link}" style="background:#007bff;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;">
        Verificar mi cuenta
      </a>
      <p>Este enlace expirará en 10 minutos.</p>
    `
  )
}

/**
 * GET /confirm → valida el token del link de activación
 */
export async function confirmEmail(req: Request, res: Response) {
  const { token } = req.query
  const {password, passwordConfirm} = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json(ApiResponse.invalidToken('Token inválido'))
  }
  if (password !== passwordConfirm) {
    return res.status(400).json(ApiResponse.passwordMismatch());
  }
  if (!password || password.length < 6) {
    return res.status(400).json(ApiResponse.validationErrorSingle('password', 'La contraseña debe tener al menos 6 caracteres'));
  }

  const record = await validateUserToken(token, TokenType.EMAIL_VERIFICATION)
  if (!record) {
    return res.status(400).json(ApiResponse.invalidToken())
  }

  record.user.emailVerified = true
  record.user.password = makePassword(password as string);
  await DI.em.persistAndFlush(record.user)
  await markTokenUsed(record)

  return res.status(200).json(ApiResponse.success({
    message: 'Correo verificado exitosamente. Ya puedes iniciar sesión.',
  }))
}

/**
 * POST /send → vuelve a enviar el correo de verificación
 */
const resendEmailVerification = async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) return res.status(401).json(ApiResponse.unauthorized())

  if (user.emailVerified) {
    return res.status(400).json(ApiResponse.badRequest('El correo ya está verificado.'))
  }

  await sendVerificationEmail(user)
  return res.status(200).json(ApiResponse.success({
    message: 'Se envió un nuevo enlace de verificación a tu correo.',
  }))
}

/**
 * Router principal
 */
export const emailVerificationRouter = express.Router({ mergeParams: true })
emailVerificationRouter.post('/send', resendEmailVerification)
emailVerificationRouter.post('/confirm', confirmEmail)

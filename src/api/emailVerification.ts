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
  const link = `${process.env.FRONTEND_URL || 'https://tuservidor.com'}/verify-email?token=${record.token}`

  const { data, error } = await sendEmail(
    user.email,
    'Activa tu cuenta - Sistema de Giros',
    `
      <h2>Verifica tu correo electrónico</h2>
      <p>Haz clic en el siguiente enlace para activar tu cuenta:</p>
      <a href="${link}" style="background:#007bff;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;">
        Verificar mi cuenta
      </a>
      <p>Este enlace expirará en 10 minutos.</p>
      <p>Si no solicitaste esta verificación, ignora este correo.</p>
    `
  )

  if (error) {
    console.error('❌ Error enviando email de verificación:', error)
    throw new Error(`Email sending failed: ${error.message}`)
  }

  console.log('✅ Email de verificación enviado a', user.email)
}

/**
 * POST /confirm → valida el token del link de activación y establece la contraseña
 */
export async function confirmEmail(req: Request, res: Response) {
  const { token } = req.query
  const { password, passwordConfirm } = req.body

  // Validar token
  if (!token || typeof token !== 'string') {
    return res.status(400).json(ApiResponse.invalidToken('Token inválido'))
  }

  // Validar passwords
  if (!password || !passwordConfirm) {
    return res
      .status(400)
      .json(ApiResponse.validationErrorSingle('password', 'La contraseña es requerida'))
  }

  if (password !== passwordConfirm) {
    return res.status(400).json(ApiResponse.passwordMismatch())
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json(ApiResponse.validationErrorSingle('password', 'La contraseña debe tener al menos 6 caracteres'))
  }

  // Validar token
  const record = await validateUserToken(token, TokenType.EMAIL_VERIFICATION)
  if (!record) {
    return res.status(400).json(ApiResponse.invalidToken('Token inválido o expirado'))
  }

  // Verificar que el usuario no esté ya verificado
  if (record.user.emailVerified) {
    return res.status(400).json(ApiResponse.badRequest('El correo ya está verificado'))
  }

  // Marcar como verificado y establecer contraseña
  record.user.emailVerified = true
  record.user.password = makePassword(password as string)
  await DI.em.persistAndFlush(record.user)
  await markTokenUsed(record)

  console.log(`✅ Email verificado para usuario: ${record.user.email}`)

  return res.status(200).json(
    ApiResponse.success({
      message: 'Correo verificado exitosamente. Ya puedes iniciar sesión.',
    })
  )
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
  return res.status(200).json(
    ApiResponse.success({
      message: 'Se envió un nuevo enlace de verificación a tu correo.',
    })
  )
}

/**
 * Router principal
 */
export const emailVerificationRouter = express.Router({ mergeParams: true })
emailVerificationRouter.post('/send', resendEmailVerification)
emailVerificationRouter.post('/confirm', confirmEmail)

import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { TokenType } from '@/entities/UserToken'
import { checkPassword, makePassword } from '@/lib/passwordUtils'
import { generateAccessToken } from '@/lib/tokenUtils'
import { createUserToken, validateUserToken, markTokenUsed } from '@/lib/userTokenUtils'
import { sendEmail } from '@/lib/emailUtils'
import { sendVerificationEmail } from '@/api/emailVerification'

export class UserService {
  /**
   * Autentica un usuario con email y contraseña
   */
  async login(email: string, password: string): Promise<{ user: User; token: string } | null> {
    const userRepo = DI.em.getRepository(User)
    const user = await userRepo.findOne({ email })

    if (!user || !checkPassword(password, user.password)) {
      return null
    }

    const token = generateAccessToken({
      email: user.email,
      id: user.id,
      role: user.role,
    })

    return { user, token }
  }

  /**
   * Crea un nuevo usuario
   */
  async register(data: {
    email: string
    password: string
    fullName: string
    role?: UserRole
  }): Promise<{ user: User; token: string } | { error: 'USER_EXISTS' }> {
    const userRepo = DI.em.getRepository(User)
    const existing = await userRepo.findOne({ email: data.email })

    if (existing) {
      return { error: 'USER_EXISTS' }
    }

    const hashedPassword = makePassword(data.password)
    const user = userRepo.create({
      email: data.email,
      fullName: data.fullName,
      password: hashedPassword,
      role: data.role || UserRole.MINORISTA,
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(user)

    // Enviar email de verificación (no bloqueante)
    try {
      await sendVerificationEmail(user)
    } catch (error) {
      console.error('❌ Error enviando correo de verificación:', error)
    }

    const token = generateAccessToken({
      email: user.email,
      id: user.id,
      role: user.role,
    })

    return { user, token }
  }

  /**
   * Cambia la contraseña de un usuario
   */
  async changePassword(
    user: User,
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    if (!checkPassword(oldPassword, user.password)) {
      return false
    }

    user.password = makePassword(newPassword)
    await DI.em.persistAndFlush(user)

    return true
  }

  /**
   * Envía email de restablecimiento de contraseña
   */
  async sendResetPasswordEmail(email: string): Promise<boolean> {
    const userRepo = DI.em.getRepository(User)
    const user = await userRepo.findOne({ email })

    if (!user) {
      // Retornar true para no revelar si el email existe
      return true
    }

    const record = await createUserToken(user, TokenType.PASSWORD_RESET, 15)
    const link = `${process.env.FRONTEND_URL || 'https://tuservidor.com'}/reset-password?token=${record.token}`

    await sendEmail(
      user.email,
      'Restablece tu contraseña - Sistema de Giros',
      `
        <h2>Restablecer contraseña</h2>
        <p>Haz clic en el siguiente enlace para cambiar tu contraseña:</p>
        <a href="${link}" style="background:#28a745;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;">
          Restablecer contraseña
        </a>
        <p>Este enlace expirará en 15 minutos.</p>
      `
    )

    return true
  }

  /**
   * Restablece la contraseña usando un token
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const record = await validateUserToken(token, TokenType.PASSWORD_RESET)

    if (!record) {
      return false
    }

    record.user.password = makePassword(newPassword)
    await DI.em.persistAndFlush(record.user)
    await markTokenUsed(record)

    return true
  }

  /**
   * Obtiene un usuario por email
   */
  async findByEmail(email: string): Promise<User | null> {
    const userRepo = DI.em.getRepository(User)
    return userRepo.findOne({ email })
  }

  /**
   * Obtiene un usuario por ID
   */
  async findById(id: string): Promise<User | null> {
    const userRepo = DI.em.getRepository(User)
    return userRepo.findOne({ id })
  }
}

// Exportar una instancia singleton
export const userService = new UserService()

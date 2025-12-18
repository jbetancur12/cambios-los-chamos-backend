import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { TokenType } from '@/entities/UserToken'
import { checkPassword, makePassword } from '@/lib/passwordUtils'
import { generateAccessToken } from '@/lib/tokenUtils'
import { createUserToken, validateUserToken, markTokenUsed } from '@/lib/userTokenUtils'
import { sendEmail } from '@/lib/emailUtils'
import { sendVerificationEmail } from '@/api/emailVerification'
import { Transferencista } from '@/entities/Transferencista'
import { Minorista } from '@/entities/Minorista'
import { logger } from '@/lib/logger'

export class UserService {
  /**
   * Autentica un usuario con email y contraseña
   */
  async login(email: string, password: string): Promise<{ user: User; token: string } | null> {
    const userRepo = DI.em.getRepository(User)
    const user = await userRepo.findOne({ email: { $ilike: email } }, { populate: ['minorista', 'transferencista'] })

    // Check if user exists and password matches
    if (!user || !checkPassword(password, user.password || '')) {
      return null
    }

    if (user.emailVerified === false) {
      throw new Error(
        'Tu correo electrónico no ha sido verificado. Por favor, verifica tu correo antes de iniciar sesión.'
      )
    }

    if (!user.isActive) {
      throw new Error('Tu cuenta ha sido desactivada. Por favor contacta al administrador.')
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
    const normalizedEmail = data.email.toLowerCase()
    const existing = await userRepo.findOne({ email: { $ilike: normalizedEmail } })

    if (existing) {
      return { error: 'USER_EXISTS' }
    }

    const hashedPassword = makePassword(data.password)
    const role = data.role || UserRole.MINORISTA

    const user = userRepo.create({
      email: normalizedEmail,
      fullName: data.fullName,
      password: hashedPassword,
      role,
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Transacción para crear usuario y sus relaciones
    await DI.em.transactional(async (em) => {
      await em.persistAndFlush(user)

      // Crear Transferencista si el rol es TRANSFERENCISTA
      if (role === UserRole.TRANSFERENCISTA) {
        const transferencistaRepo = em.getRepository(Transferencista)
        const transferencista = transferencistaRepo.create({
          user,
          available: true,
          bankAccounts: [],
          giros: [],
        })
        await em.persistAndFlush(transferencista)
      }

      // Crear Minorista si el rol es MINORISTA
      if (role === UserRole.MINORISTA) {
        const minoristaRepo = em.getRepository(Minorista)
        const minorista = minoristaRepo.create({
          user,
          creditLimit: 0,
          availableCredit: 0,
          creditBalance: 0,
          profitPercentage: 0.05,
          transactions: [],
          giros: [],
        })
        await em.persistAndFlush(minorista)
      }
    })

    // Enviar email de verificación (no bloqueante)
    // Si falla, el usuario se crea de todas formas pero no podrá iniciar sesión hasta verificar
    setImmediate(async () => {
      try {
        await sendVerificationEmail(user)
      } catch (error) {
        logger.error({ error, email: user.email }, '❌ Error enviando correo de verificación')
        // Log para investigación, pero no afecta la creación del usuario
      }
    })

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
  async changePassword(user: User, oldPassword: string, newPassword: string): Promise<boolean> {
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
    const user = await userRepo.findOne({ email: { $ilike: email.trim() } })

    if (!user) {
      // Retornar true para no revelar si el email existe
      return true
    }

    try {
      const record = await createUserToken(user, TokenType.PASSWORD_RESET, 15)
      const link = `${process.env.FRONTEND_URL || 'https://tuservidor.com'}/reset-password?token=${record.token}`

      const { error } = await sendEmail(
        user.email,
        'Restablece tu contraseña - Sistema de Giros',
        `
          <h2>Restablecer contraseña</h2>
          <p>Haz clic en el siguiente enlace para cambiar tu contraseña:</p>
          <a href="${link}" style="background:#28a745;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;">
            Restablecer contraseña
          </a>
          <p>Este enlace expirará en 15 minutos.</p>
          <p>Si no solicitaste un restablecimiento, ignora este correo y tu contraseña permanecerá sin cambios.</p>
        `
      )

      if (error) {
        logger.error({ error }, '❌ Error enviando email de reset de contraseña')
        // Retornar true de todas formas para no revelar errores internos
        return true
      }

      logger.info(`✅ Email de reset de contraseña enviado a ${user.email}`)
      return true
    } catch (error) {
      logger.error({ error }, '❌ Error inesperado en sendResetPasswordEmail')
      // Retornar true de todas formas para no revelar errores internos
      return true
    }
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
    return userRepo.findOne({ email: { $ilike: email.trim() } })
  }

  /**
   * Obtiene un usuario por ID
   */
  async findById(id: string): Promise<User | null> {
    const userRepo = DI.em.getRepository(User)
    return userRepo.findOne({ id })
  }

  async getUsersByRole(role: UserRole) {
    const userRepo = DI.em.getRepository(User)
    const users = await userRepo.find({ role })
    return users
  }

  async toggleUserActiveStatus(userId: string): Promise<User | false> {
    const userRepo = DI.em.getRepository(User)
    const user = await userRepo.findOne({ id: userId })
    logger.debug({ user }, 'UserService toggleUserActiveStatus')

    if (!user) {
      return false
    }

    user.isActive = !user.isActive
    await DI.em.persistAndFlush(user)
    return user
  }
}

// Exportar una instancia singleton
export const userService = new UserService()

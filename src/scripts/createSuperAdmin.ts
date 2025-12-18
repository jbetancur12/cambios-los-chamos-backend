import 'reflect-metadata'
import { MikroORM } from '@mikro-orm/core'
import { initDI, DI } from '@/di'
import { UserRole } from '../entities/User'
import { makePassword } from '../lib/passwordUtils'
import { logger } from '../lib/logger'

const SUPERADMIN_EMAIL = 'jabetancur12@gmail.com'
const SUPERADMIN_PASSWORD = '12345678' // Change this!

const createSuperAdmin = async () => {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const existing = await DI.users.findOne({ email: SUPERADMIN_EMAIL })
    if (existing) {
      logger.warn(`⚠️ Ya existe un usuario con el email ${SUPERADMIN_EMAIL}`)
      return
    }

    const user = DI.users.create({
      fullName: 'Super Admin',
      email: SUPERADMIN_EMAIL,
      password: makePassword(SUPERADMIN_PASSWORD),
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(user)

    logger.info('✅ Superadmin creado exitosamente:')
    logger.info(`   Email: ${SUPERADMIN_EMAIL}`)
    logger.info(`   Password: ${SUPERADMIN_PASSWORD}`)
  } catch (err) {
    logger.error({ err }, '❌ Error creando superadmin')
  } finally {
    await DI.orm.close()
  }
}

createSuperAdmin()

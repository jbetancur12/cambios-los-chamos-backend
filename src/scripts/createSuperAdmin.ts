import 'reflect-metadata'
import { MikroORM } from '@mikro-orm/core'
import config from '@/mikro-orm.config'
import { User, UserRole } from '@/entities/User'
import { makePassword } from '@/lib/passwordUtils'
import { SUPERADMIN_EMAIL, SUPERADMIN_FULL_NAME, SUPERADMIN_PASSWORD } from '@/settings'

async function createSuperAdmin() {
  const orm = await MikroORM.init(config)
  const em = orm.em.fork()



  const existing = await em.findOne(User, { email: SUPERADMIN_EMAIL })
  if (existing) {
    console.log(`⚠️ Ya existe un usuario con el email ${SUPERADMIN_EMAIL}`)
    await orm.close()
    return
  }

  const hashedPassword = makePassword(SUPERADMIN_PASSWORD)

  const user = em.create(User, {
    fullName: SUPERADMIN_FULL_NAME,
    email: SUPERADMIN_EMAIL,
    password: hashedPassword,
    role: UserRole.SUPER_ADMIN,
    isActive: true,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await em.persistAndFlush(user)
  console.log('✅ Superadmin creado exitosamente:')
  console.log(`   Email: ${SUPERADMIN_EMAIL}`)
  console.log(`   Password: ${SUPERADMIN_PASSWORD}`)

  await orm.close()
}

createSuperAdmin().catch((err) => {
  console.error('❌ Error creando superadmin:', err)
  process.exit(1)
})

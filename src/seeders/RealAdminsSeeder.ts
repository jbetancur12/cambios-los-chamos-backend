import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User, UserRole } from '@/entities/User'
import { makePassword } from '@/lib/passwordUtils'
import { logger } from '@/lib/logger'

// Datos de los admins reales
const realAdminsData = [
  // Puedes agregar todos los admins reales que necesites aquí
  { fullName: 'Cambios los Chamos', email: 'admin.real.principal@suempresa.com' },
  // { fullName: 'Otro Admin', email: 'otro.admin@suempresa.com' },
]

export class RealAdminsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const defaultPassword = makePassword('12345678')

    logger.info('Iniciando RealAdminsSeeder...')

    for (const data of realAdminsData) {
      // 1. Verificar si el usuario ya existe
      const existingUser = await em.findOne(User, { email: data.email })

      if (!existingUser) {
        // 2. Crear la entidad User
        const admin = em.create(User, {
          fullName: data.fullName,
          email: data.email,
          password: defaultPassword,
          role: UserRole.ADMIN, // Rol de Administrador
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        em.persist(admin)
        logger.info(`Admin creado: ${data.fullName} (${data.email})`)
      } else {
        logger.info(`Usuario ya existe, omitiendo: ${data.email}`)
      }
    }

    // Guardar todos los cambios
    await em.flush()
    logger.info('RealAdminsSeeder finalizado.')
  }
}

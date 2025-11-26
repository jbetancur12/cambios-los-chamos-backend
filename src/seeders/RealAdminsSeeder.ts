import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User, UserRole } from '@/entities/User'
import { makePassword } from '@/lib/passwordUtils'

// Datos de los admins reales
const realAdminsData = [
  // Puedes agregar todos los admins reales que necesites aquí
  { fullName: 'Cambios los Chamos', email: 'admin.real.principal@suempresa.com' },
  // { fullName: 'Otro Admin', email: 'otro.admin@suempresa.com' },
]

export class RealAdminsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const defaultPassword = makePassword('12345678')

    console.log('Iniciando RealAdminsSeeder...')

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
        console.log(`Admin creado: ${data.fullName} (${data.email})`)
      } else {
        console.log(`Usuario ya existe, omitiendo: ${data.email}`)
      }
    }

    // Guardar todos los cambios
    await em.flush()
    console.log('RealAdminsSeeder finalizado.')
  }
}

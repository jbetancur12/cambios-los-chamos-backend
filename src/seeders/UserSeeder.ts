import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { Minorista } from '@/entities/Minorista'
import { makePassword } from '@/lib/passwordUtils'

export class UserSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const defaultPassword = makePassword('12345678')

    // Crear Admins
    for (let i = 1; i <= 2; i++) {
      const email = `admin${i}@test.com`
      const existingUser = await em.findOne(User, { email })

      if (!existingUser) {
        const admin = em.create(User, {
          fullName: `Admin ${i}`,
          email,
          password: defaultPassword,
          role: UserRole.ADMIN,
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        em.persist(admin)
      }
    }

    // Crear Transferencistas
    for (let i = 1; i <= 2; i++) {
      const email = `transferencista${i}@test.com`
      const existingUser = await em.findOne(User, { email })

      if (!existingUser) {
        const user = em.create(User, {
          fullName: `Transferencista ${i}`,
          email,
          password: defaultPassword,
          role: UserRole.TRANSFERENCISTA,
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        em.persist(user)

        const transferencista = em.create(Transferencista, {
          user,
          available: true,
          bankAccounts: [],
          giros: [],
        })
        em.persist(transferencista)
      }
    }

    // Crear Minoristas
    for (let i = 1; i <= 2; i++) {
      const email = `minorista${i}@test.com`
      const existingUser = await em.findOne(User, { email })

      if (!existingUser) {
        const user = em.create(User, {
          fullName: `Minorista ${i}`,
          email,
          password: defaultPassword,
          role: UserRole.MINORISTA,
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        em.persist(user)

        const minorista = em.create(Minorista, {
          user,
          creditLimit: 0,
          availableCredit: 0,
          transactions: [],
          giros: [],
        })
        em.persist(minorista)
      }
    }

    await em.flush()
  }
}

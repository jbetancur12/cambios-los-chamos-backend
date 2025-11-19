import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { Minorista } from '@/entities/Minorista'
import { BankAccount, AccountType } from '@/entities/BankAccount'
import { Bank } from '@/entities/Bank'
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

    // Crear Transferencistas con sus cuentas bancarias
    const bankAccountsData = [
      {
        transferencista: 1,
        banks: [
          {
            bankName: 'Banco de Venezuela',
            accountNumber: '0102-0123-4567-8901-2345',
            accountHolder: 'María Fernanda Rodríguez',
            accountType: AccountType.AHORROS,
          },
          {
            bankName: 'Banco Mercantil',
            accountNumber: '0105-0034-5678-9012-3456',
            accountHolder: 'Carolina del Valle Gómez',
            accountType: AccountType.AHORROS,
          },
        ],
      },
      {
        transferencista: 2,
        banks: [
          {
            bankName: 'Banesco Banco Universal',
            accountNumber: '0134-5678-9012-3456-7890',
            accountHolder: 'José Antonio Pérez',
            accountType: AccountType.CORRIENTE,
          },
          {
            bankName: 'Banco Provincial',
            accountNumber: '0108-0098-7654-3210-9876',
            accountHolder: 'Luis Eduardo Salazar',
            accountType: AccountType.CORRIENTE,
          },
        ],
      },
    ]

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

        // Crear cuentas bancarias después de crear el transferencista
        const transferencistaData = bankAccountsData.find((d) => d.transferencista === i)
        if (transferencistaData) {
          for (const bankData of transferencistaData.banks) {
            const bank = await em.findOne(Bank, { name: bankData.bankName })
            if (bank) {
              const bankAccount = em.create(BankAccount, {
                transferencista,
                bank,
                accountNumber: bankData.accountNumber,
                accountHolder: bankData.accountHolder,
                accountType: bankData.accountType,
                balance: 0,
              })
              em.persist(bankAccount)
              transferencista.bankAccounts.push(bankAccount)
            }
          }
        }
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
          creditBalance: 0,
          transactions: [],
          giros: [],
        })
        em.persist(minorista)
      }
    }

    await em.flush()
  }
}

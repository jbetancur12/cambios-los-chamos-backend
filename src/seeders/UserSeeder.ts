import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { Minorista } from '@/entities/Minorista'
import { BankAccount, BankAccountOwnerType } from '@/entities/BankAccount'
import { Bank } from '@/entities/Bank'
import { BankAccountTransaction, BankAccountTransactionType } from '@/entities/BankAccountTransaction'
import { makePassword } from '@/lib/passwordUtils'
import { SUPERADMIN_EMAIL } from '@/settings'

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
            bankName: 'BANCO DE VENEZUELA',
            accountHolder: 'María Fernanda Rodríguez',
          },
          {
            bankName: 'BANCO MERCANTIL',
            accountHolder: 'Carolina del Valle Gómez',
          },
        ],
      },
      {
        transferencista: 2,
        banks: [
          {
            bankName: 'BANESCO',
            accountHolder: 'José Antonio Pérez',
          },
          {
            bankName: 'BBVA PROVINCIAL',
            accountHolder: 'Luis Eduardo Salazar',
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
                accountHolder: bankData.accountHolder,
                balance: 60000,
                ownerType: BankAccountOwnerType.TRANSFERENCISTA,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              em.persist(bankAccount)

              // Crear transacción de recarga inicial de 60,000 por el superadmin
              const superadmin = await em.findOne(User, { email: SUPERADMIN_EMAIL })
              if (superadmin) {
                const transaction = em.create(BankAccountTransaction, {
                  bankAccount,
                  amount: 60000,
                  fee: 0,
                  type: BankAccountTransactionType.DEPOSIT,
                  previousBalance: 0,
                  currentBalance: 60000,
                  createdBy: superadmin,
                  createdAt: new Date(),
                })
                em.persist(transaction)
              }
            }
          }
        }
      }
    }

    // Crear Minoristas con cupo de crédito de 500,000
    const creditLimit = 500000
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
          creditLimit,
          availableCredit: creditLimit, // Inicialmente todo el crédito está disponible
          creditBalance: 0, // Sin saldo utilizado
          profitPercentage: 0.05,
          transactions: [],
          giros: [],
        })
        em.persist(minorista)
      }
    }

    await em.flush()
  }
}

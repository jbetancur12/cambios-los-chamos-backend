import { initDI, DI } from '../di'
import { User, UserRole } from '../entities/User'
import { Minorista } from '../entities/Minorista'
import { Bank, Currency } from '../entities/Bank'
import { Transferencista } from '../entities/Transferencista'
import { giroService } from '../services/GiroService'
import { minoristaService } from '../services/MinoristaService'
import { ExecutionType, Giro } from '../entities/Giro'
import { exchangeRateService } from '../services/ExchangeRateService'
import { MinoristaTransaction } from '../entities/MinoristaTransaction'
import { ExchangeRate } from '../entities/ExchangeRate'

async function run() {
  try {
    await initDI()
    const em = DI.orm.em.fork()
    // Hack to make services use this EM if they use DI.em
    ;(DI as any).em = em
    DI.users = em.getRepository(User) as any
    DI.banks = em.getRepository(Bank) as any
    DI.giros = em.getRepository(Giro) as any
    DI.minoristas = em.getRepository(Minorista) as any
    DI.transferencistas = em.getRepository(Transferencista) as any
    DI.minoristaTransactions = em.getRepository(MinoristaTransaction) as any
    DI.exchangeRates = em.getRepository(ExchangeRate) as any

    console.log('--- STARTING REPRODUCTION SCRIPT ---')

    // 1. Create or get necessary data
    // Bank
    let bank = await em.findOne(Bank, { code: 9999 })
    if (!bank) {
      bank = em.create(Bank, {
        name: 'Test Bank',
        code: 9999,
        currency: Currency.VES,
      } as any)
      await em.persistAndFlush(bank)
    }

    // Exchange Rate
    const rates = await em.find(ExchangeRate, {}, { orderBy: { createdAt: 'DESC' }, limit: 1 })
    let rate = rates[0]
    if (!rate) {
      console.log('Creating default exchange rate...')
      const adminUser = await em.findOne(User, { role: UserRole.SUPER_ADMIN })
      if (!adminUser) {
        // Try to find any user or create one
        const users = await em.find(User, {}, { limit: 1 })
        let anyUser = users[0]
        if (!anyUser) {
          anyUser = em.create(User, {
            email: 'admin_test@example.com',
            fullName: 'Test Admin',
            password: 'password123',
            role: UserRole.SUPER_ADMIN,
            isActive: true,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          await em.persistAndFlush(anyUser)
        }
        rate = em.create(ExchangeRate, {
          buyRate: 40,
          sellRate: 45,
          usd: 40,
          bcv: 40,
          createdBy: anyUser,
          createdAt: new Date(),
          isCustom: false,
        })
        await em.persistAndFlush(rate)
      } else {
        rate = em.create(ExchangeRate, {
          buyRate: 40,
          sellRate: 45,
          usd: 40,
          bcv: 40,
          createdBy: adminUser,
          createdAt: new Date(),
          isCustom: false,
        })
        await em.persistAndFlush(rate)
      }
    }

    // Transferencista (needed for assignment)
    let transferencistaUser = await em.findOne(User, { email: 'transf_test@example.com' })
    if (!transferencistaUser) {
      transferencistaUser = em.create(User, {
        email: 'transf_test@example.com',
        fullName: 'Test Transferencista',
        password: 'password123',
        role: UserRole.TRANSFERENCISTA,
        isActive: true,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await em.persistAndFlush(transferencistaUser)
    }

    let transferencista = await em.findOne(Transferencista, { user: transferencistaUser })
    if (!transferencista) {
      transferencista = em.create(Transferencista, {
        user: transferencistaUser,
        available: true,
      } as any)
      await em.persistAndFlush(transferencista)
    } else {
      transferencista.available = true
      await em.persistAndFlush(transferencista)
    }

    // Minorista User
    let minoristaUser = await em.findOne(User, { email: 'minorista_test@example.com' })
    if (!minoristaUser) {
      minoristaUser = em.create(User, {
        email: 'minorista_test@example.com',
        fullName: 'Test Minorista',
        password: 'password123',
        role: UserRole.MINORISTA,
        isActive: true,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await em.persistAndFlush(minoristaUser)
    }

    // Minorista Entity
    let minorista = await em.findOne(Minorista, { user: minoristaUser })
    if (!minorista) {
      minorista = em.create(Minorista, {
        user: minoristaUser,
        creditLimit: 500000,
        availableCredit: 500000,
        creditBalance: 0,
        profitPercentage: 0.05,
      } as any)
      await em.persistAndFlush(minorista)
    }

    // Reset Minorista State to match user scenario
    // "asigne cupo de 500000"
    minorista.creditLimit = 500000
    // "carge una deuda de -120000" -> This means availableCredit = 500000 - 120000 = 380000?
    // Or maybe they mean they set availableCredit to 350000?
    // User said: "si apaece que quedo con credito disponible de 350000"
    // Let's set availableCredit to 350000
    minorista.availableCredit = 350000
    minorista.creditBalance = 0
    await em.persistAndFlush(minorista)

    console.log(
      `Initial State: CreditLimit=${minorista.creditLimit}, Available=${minorista.availableCredit}, Debt=${minorista.creditLimit - minorista.availableCredit}`
    )

    // 2. Execute Giro
    console.log('Executing Giro of 80000...')
    const amount = 80000

    const result = await giroService.createGiro(
      {
        minoristaId: minorista.id,
        beneficiaryName: 'Test Beneficiary',
        beneficiaryId: '12345678',
        bankId: bank.id,
        accountNumber: '01020304050607080900',
        phone: '5551234',
        amountInput: amount,
        currencyInput: Currency.VES,
        amountBs: amount,
        rateApplied: rate as any,
        executionType: ExecutionType.TRANSFERENCIA,
      },
      minoristaUser
    )

    if ('error' in result) {
      console.error('Error creating giro:', result.error)
      return
    }

    console.log('Giro created successfully:', result.id)

    // 3. Verify State
    // Refresh minorista
    await em.refresh(minorista)
    console.log(
      `Final State: CreditLimit=${minorista.creditLimit}, Available=${minorista.availableCredit}, Debt=${minorista.creditLimit - minorista.availableCredit}`
    )

    const expectedAvailable = 350000 - amount + amount * 0.05 // Deduct amount, add profit (5%)
    console.log(`Expected Available (approx): ${expectedAvailable}`)

    // Check transactions
    const transactions = await em.find(
      MinoristaTransaction,
      { minorista: minorista.id },
      { orderBy: { createdAt: 'DESC' }, limit: 5 }
    )
    console.log('Recent Transactions:')
    transactions.forEach((t) => {
      console.log(`- ID: ${t.id}, Type: ${t.type}, Amount: ${t.amount}, Giro: ${t.giro?.id}`)
    })

    const linkedTransaction = transactions.find((t) => t.giro?.id === result.id)
    if (linkedTransaction) {
      console.log('SUCCESS: Transaction linked to Giro found.')
    } else {
      console.error('FAILURE: No transaction linked to Giro found.')
    }

    // SIMULATE BUG: Revert minorista balance to initial state (as if em.refresh discarded the changes)
    // This simulates that the first giro was made BEFORE the fix.
    console.log('--- SIMULATING BUG EFFECT (Reverting balance to 350k) ---')
    minorista.availableCredit = 350000
    minorista.creditBalance = 0
    await em.persistAndFlush(minorista)
    console.log('--- END SIMULATION ---')

    // 4. Execute Second Giro (10000)
    console.log('\nExecuting Second Giro of 10000...')
    const amount2 = 10000

    // Simulate new request context by clearing EM or refreshing minorista from DB
    // In a real app, this is a new request, so we fetch minorista again.
    // Let's force a clear to simulate a fresh request
    em.clear()

    const minoristaUser2 = await em.findOne(User, { email: 'minorista_test@example.com' })
    const minorista2 = await em.findOne(Minorista, { user: minoristaUser2 })
    const bank2 = await em.findOne(Bank, { code: 9999 })
    const rate2 = (await em.find(ExchangeRate, {}, { orderBy: { createdAt: 'DESC' }, limit: 1 }))[0]

    if (!minorista2 || !minoristaUser2 || !bank2 || !rate2) {
      console.error('Could not fetch entities for second run')
      return
    }

    console.log(`State before 2nd Giro: CreditLimit=${minorista2.creditLimit}, Available=${minorista2.availableCredit}`)

    const result2 = await giroService.createGiro(
      {
        minoristaId: minorista2.id,
        beneficiaryName: 'Test Beneficiary 2',
        beneficiaryId: '87654321',
        bankId: bank2.id,
        accountNumber: '01020304050607080900',
        phone: '5551234',
        amountInput: amount2,
        currencyInput: Currency.VES,
        amountBs: amount2,
        rateApplied: rate2 as any,
        executionType: ExecutionType.TRANSFERENCIA,
      },
      minoristaUser2
    )

    if ('error' in result2) {
      console.error('Error creating 2nd giro:', result2.error)
      return
    }

    console.log('2nd Giro created successfully:', result2.id)

    // 5. Verify Final State
    await em.refresh(minorista2)
    console.log(
      `Final State after 2nd Giro: CreditLimit=${minorista2.creditLimit}, Available=${minorista2.availableCredit}, Debt=${minorista2.creditLimit - minorista2.availableCredit}`
    )

    const expectedAvailable2 = expectedAvailable - amount2 + amount2 * 0.05
    console.log(`Expected Available 2 (approx): ${expectedAvailable2}`)

    // Check if it matches the "buggy" state (150k + 10k - 500 = 159.5k debt -> 340.5k available)
    const buggyAvailable = 500000 - (150000 + 10000 - 500)
    console.log(`Buggy Available (if reset to initial): ${buggyAvailable}`)
  } catch (error) {
    console.error('Unexpected error:', error)
  } finally {
    await DI.orm.close()
  }
}

run()

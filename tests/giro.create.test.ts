import { describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { Giro, GiroStatus } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import {
  MinoristaTransaction,
  MinoristaTransactionStatus,
  MinoristaTransactionType,
} from '@/entities/MinoristaTransaction'
import { giroService } from '@/services/GiroService'
import { setupTestDb, resetTestDb, closeTestDb, dbTest, readFresh, inContext } from './helpers/db'
import {
  createAdmin,
  createAssignmentTracker,
  createBank,
  createMinorista,
  createRate,
  createTransferencista,
  giroInput,
  type MinoristaOptions,
} from './helpers/factories'

// Rate used by the factories: sell 100, buy 90. 100,000 COP leaves 100,000 - (100,000 / 100) * 90 = 10,000 of profit.

const world = async (minoristaOptions?: MinoristaOptions) => {
  const admin = await createAdmin()
  const bank = await createBank()
  const rate = await createRate(admin)
  const transferencista = await createTransferencista()
  const minorista = await createMinorista(minoristaOptions)
  return { admin, bank, rate, transferencista, ...minorista }
}

const minoristaState = async (id: string) => {
  const m = await readFresh(Minorista, id)
  return { available: Number(m.availableCredit), inFavor: Number(m.creditBalance) }
}

const asGiro = (result: Awaited<ReturnType<typeof giroService.createGiro>>): Giro => {
  assert.ok(!('error' in result), `unexpected error: ${JSON.stringify(result)}`)
  return result as Giro
}

describe('giroService.createGiro', () => {
  before(setupTestDb)
  beforeEach(resetTestDb)
  after(closeTestDb)

  describe('giroService.createGiro: minorista balance', () => {
    dbTest('discounts the amount and gives back the 5% immediate profit', async () => {
      const w = await world()
      const giro = asGiro(
        await giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user)
      )

      assert.equal(giro.status, GiroStatus.ASIGNADO)
      // 1,000,000 - 100,000 = 900,000, plus 5% of 100,000 back = 905,000
      assert.deepEqual(await minoristaState(w.minorista.id), { available: 905_000, inFavor: 0 })

      const transactions = await DI.orm.em.fork().find(MinoristaTransaction, { minorista: w.minorista.id })
      assert.equal(transactions.length, 1)
      assert.equal(transactions[0].type, MinoristaTransactionType.DISCOUNT)
      assert.equal(
        transactions[0].status,
        MinoristaTransactionStatus.PENDING,
        'the discount stays on hold until the giro is executed'
      )
      assert.equal(Number(transactions[0].profitEarned), 5_000)
    })

    dbTest('spends the balance in favor before the credit', async () => {
      const w = await world({ creditBalance: 50_000 })
      asGiro(
        await giroService.createGiro(
          giroInput(w.bank, w.rate, { minoristaId: w.minorista.id, amountInput: 80_000, amountBs: 800 }),
          w.user
        )
      )

      // 50,000 from the balance in favor, 30,000 from the credit: 1,000,000 - 30,000 + 4,000 (5% of 80,000)
      assert.deepEqual(await minoristaState(w.minorista.id), { available: 974_000, inFavor: 0 })
    })

    dbTest('rejects the giro when the credit is not enough and leaves everything untouched', async () => {
      const w = await world({ availableCredit: 50_000 })
      const result = await giroService.createGiro(
        giroInput(w.bank, w.rate, { minoristaId: w.minorista.id, amountInput: 80_000, amountBs: 800 }),
        w.user
      )

      assert.deepEqual(result, { error: 'INSUFFICIENT_BALANCE' })
      assert.equal(await DI.orm.em.fork().count(Giro), 0)
      assert.equal(await DI.orm.em.fork().count(MinoristaTransaction), 0)
      assert.deepEqual(await minoristaState(w.minorista.id), { available: 50_000, inFavor: 0 })
    })

    dbTest(
      'counts the balance in favor when checking that the minorista can afford the giro',
      async () => {
        // 50,000 of credit + 100,000 in favor can cover 80,000, but the pre-check only looks at the credit
        const w = await world({ availableCredit: 50_000, creditBalance: 100_000 })
        const result = await giroService.createGiro(
          giroInput(w.bank, w.rate, { minoristaId: w.minorista.id, amountInput: 80_000, amountBs: 800 }),
          w.user
        )
        assert.ok(!('error' in result), `unexpected error: ${JSON.stringify(result)}`)
      },
      { todo: 'Known bug (report): availableCredit is checked without creditBalance in GiroService.createGiro' }
    )

    dbTest('two simultaneous giros cannot spend the same credit twice', async () => {
      const w = await world()
      await createAssignmentTracker()
      const request = () =>
        inContext(() =>
          giroService.createGiro(
            giroInput(w.bank, w.rate, { minoristaId: w.minorista.id, amountInput: 600_000, amountBs: 6_000 }),
            w.user
          )
        )

      const results = await Promise.all([request(), request()])
      const created = results.filter((r) => !('error' in r))
      const rejected = results.filter((r) => 'error' in r)

      assert.equal(created.length, 1, 'exactly one giro should be created')
      assert.equal(rejected.length, 1)
      assert.deepEqual(rejected[0], { error: 'INSUFFICIENT_BALANCE' })
      // 1,000,000 - 600,000 + 30,000 (5% profit)
      assert.deepEqual(await minoristaState(w.minorista.id), { available: 430_000, inFavor: 0 })
    })

    dbTest(
      'two simultaneous giros do not fail when the assignment tracker row does not exist yet',
      async () => {
        // Only the very first giro of a fresh system hits this: both requests try to create the tracker row
        const admin = await createAdmin()
        const bank = await createBank()
        const rate = await createRate(admin)
        await createTransferencista()
        const request = () => inContext(() => giroService.createGiro(giroInput(bank, rate), admin))

        const results = await Promise.allSettled([request(), request()])
        assert.deepEqual(
          results.map((r) => r.status),
          ['fulfilled', 'fulfilled']
        )
      },
      {
        todo: 'Known fragility: findNextAvailableTransferencista catches the duplicate insert, but PostgreSQL has already aborted the transaction',
      }
    )

    dbTest('rejects an inactive minorista', async () => {
      const w = await world({ isActive: false })
      await assert.rejects(
        giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user),
        /ACCOUNT_INACTIVE/
      )
      assert.equal(await DI.orm.em.fork().count(Giro), 0)
    })

    dbTest('a minorista request without minoristaId is rejected', async () => {
      const w = await world()
      assert.deepEqual(await giroService.createGiro(giroInput(w.bank, w.rate), w.user), {
        error: 'MINORISTA_NOT_FOUND',
      })
    })
  })

  describe('giroService.createGiro: profit and assignment', () => {
    dbTest('splits the profit with the default 5% for the minorista', async () => {
      const w = await world()
      const giro = asGiro(
        await giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user)
      )
      const saved = await readFresh(Giro, giro.id)

      // Total profit 10,000: 5% of 100,000 for the minorista, the rest for the system
      assert.equal(Number(saved.minoristaProfit), 5_000)
      assert.equal(Number(saved.systemProfit), 5_000)
    })

    dbTest('uses the profit percentage configured for the minorista', async () => {
      const w = await world({ profitPercentage: 0.1 })
      const giro = asGiro(
        await giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user)
      )
      const saved = await readFresh(Giro, giro.id)

      assert.equal(Number(saved.minoristaProfit), 10_000)
      assert.equal(Number(saved.systemProfit), 0)
    })

    dbTest(
      'credits the minorista balance with their own profit percentage, not a fixed 5%',
      async () => {
        const w = await world({ profitPercentage: 0.1, creditLimit: 2_000_000, availableCredit: 1_000_000 })
        asGiro(await giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user))
        // 1,000,000 - 100,000 + 10% of 100,000 = 910,000 (the giro records a 10,000 profit)
        assert.equal((await minoristaState(w.minorista.id)).available, 910_000)
      },
      { todo: 'Known bug (report): MinoristaTransactionService hardcodes 0.05 while GiroService uses profitPercentage' }
    )

    dbTest('an admin giro gives all the profit to the system and touches no minorista balance', async () => {
      const w = await world()
      const giro = asGiro(await giroService.createGiro(giroInput(w.bank, w.rate), w.admin))
      const saved = await readFresh(Giro, giro.id)

      assert.equal(Number(saved.systemProfit), 10_000)
      assert.equal(Number(saved.minoristaProfit), 0)
      assert.equal(await DI.orm.em.fork().count(MinoristaTransaction), 0)
      assert.deepEqual(await minoristaState(w.minorista.id), { available: 1_000_000, inFavor: 0 })
    })

    dbTest('rejects an unknown destination bank', async () => {
      const w = await world()
      const result = await giroService.createGiro(
        giroInput(w.bank, w.rate, { bankId: '00000000-0000-4000-8000-000000000000', minoristaId: w.minorista.id }),
        w.user
      )
      assert.deepEqual(result, { error: 'BANK_NOT_FOUND' })
      assert.equal(await DI.orm.em.fork().count(Giro), 0)
    })

    dbTest('fails without charging the minorista when no transferencista is available', async () => {
      const admin = await createAdmin()
      const bank = await createBank()
      const rate = await createRate(admin)
      await createTransferencista({ available: false })
      const { user, minorista } = await createMinorista()

      const result = await giroService.createGiro(giroInput(bank, rate, { minoristaId: minorista.id }), user)

      assert.deepEqual(result, { error: 'NO_TRANSFERENCISTA_ASSIGNED' })
      assert.equal(await DI.orm.em.fork().count(Giro), 0)
      assert.deepEqual(await minoristaState(minorista.id), { available: 1_000_000, inFavor: 0 })
    })

    dbTest('spreads giros across the available transferencistas in turns', async () => {
      const admin = await createAdmin()
      const bank = await createBank()
      const rate = await createRate(admin)
      for (let i = 0; i < 3; i++) await createTransferencista()

      const assigned: string[] = []
      for (let i = 0; i < 4; i++) {
        const giro = asGiro(await giroService.createGiro(giroInput(bank, rate), admin))
        const saved = await DI.orm.em.fork().findOneOrFail(Giro, { id: giro.id }, { populate: ['transferencista'] })
        assigned.push(saved.transferencista!.id)
      }

      assert.equal(
        new Set(assigned.slice(0, 3)).size,
        3,
        'the first three giros go to three different transferencistas'
      )
      assert.equal(assigned[3], assigned[0], 'the fourth giro starts the turn again')
    })
  })
})

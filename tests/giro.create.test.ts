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
  assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
  return result as Giro
}

describe('Crear giro', () => {
  before(setupTestDb)
  beforeEach(resetTestDb)
  after(closeTestDb)

  describe('Crear giro: saldo del minorista', () => {
    dbTest('descuenta el monto y devuelve al instante la ganancia del 5%', async () => {
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
        'el descuento queda en espera hasta que se ejecute el giro'
      )
      assert.equal(Number(transactions[0].profitEarned), 5_000)
    })

    dbTest('gasta primero el saldo a favor y después el crédito', async () => {
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

    dbTest('rechaza el giro cuando el crédito no alcanza y no toca nada', async () => {
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
      'cuenta el saldo a favor al validar que el minorista puede pagar el giro',
      async () => {
        // 50,000 of credit + 100,000 in favor can cover 80,000, but the pre-check only looks at the credit
        const w = await world({ availableCredit: 50_000, creditBalance: 100_000 })
        const result = await giroService.createGiro(
          giroInput(w.bank, w.rate, { minoristaId: w.minorista.id, amountInput: 80_000, amountBs: 800 }),
          w.user
        )
        assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
      },
      { todo: 'Bug conocido (informe): createGiro revisa availableCredit sin contar creditBalance' }
    )

    dbTest('dos giros simultáneos no pueden gastar el mismo crédito dos veces', async () => {
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

      assert.equal(created.length, 1, 'debe crearse exactamente un giro')
      assert.equal(rejected.length, 1)
      assert.deepEqual(rejected[0], { error: 'INSUFFICIENT_BALANCE' })
      // 1,000,000 - 600,000 + 30,000 (5% profit)
      assert.deepEqual(await minoristaState(w.minorista.id), { available: 430_000, inFavor: 0 })
    })

    dbTest(
      'dos giros simultáneos no fallan cuando la fila de turnos todavía no existe',
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
        todo: 'Fragilidad conocida: findNextAvailableTransferencista captura el insert duplicado, pero PostgreSQL ya abortó la transacción',
      }
    )

    dbTest('rechaza a un minorista inactivo', async () => {
      const w = await world({ isActive: false })
      await assert.rejects(
        giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user),
        /ACCOUNT_INACTIVE/
      )
      assert.equal(await DI.orm.em.fork().count(Giro), 0)
    })

    dbTest('se rechaza la solicitud de un minorista sin minoristaId', async () => {
      const w = await world()
      assert.deepEqual(await giroService.createGiro(giroInput(w.bank, w.rate), w.user), {
        error: 'MINORISTA_NOT_FOUND',
      })
    })
  })

  describe('Crear giro: ganancia y asignación', () => {
    dbTest('reparte la ganancia con el 5% por defecto para el minorista', async () => {
      const w = await world()
      const giro = asGiro(
        await giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user)
      )
      const saved = await readFresh(Giro, giro.id)

      // Total profit 10,000: 5% of 100,000 for the minorista, the rest for the system
      assert.equal(Number(saved.minoristaProfit), 5_000)
      assert.equal(Number(saved.systemProfit), 5_000)
    })

    dbTest('usa el porcentaje de ganancia configurado para el minorista', async () => {
      const w = await world({ profitPercentage: 0.1 })
      const giro = asGiro(
        await giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user)
      )
      const saved = await readFresh(Giro, giro.id)

      assert.equal(Number(saved.minoristaProfit), 10_000)
      assert.equal(Number(saved.systemProfit), 0)
    })

    dbTest(
      'acredita el saldo del minorista con su propio porcentaje de ganancia, no con un 5% fijo',
      async () => {
        const w = await world({ profitPercentage: 0.1, creditLimit: 2_000_000, availableCredit: 1_000_000 })
        asGiro(await giroService.createGiro(giroInput(w.bank, w.rate, { minoristaId: w.minorista.id }), w.user))
        // 1,000,000 - 100,000 + 10% of 100,000 = 910,000 (the giro records a 10,000 profit)
        assert.equal((await minoristaState(w.minorista.id)).available, 910_000)
      },
      {
        todo: 'Bug conocido (informe): MinoristaTransactionService usa 0.05 fijo mientras GiroService usa profitPercentage',
      }
    )

    dbTest('un giro de admin deja toda la ganancia al sistema y no toca ningún saldo de minorista', async () => {
      const w = await world()
      const giro = asGiro(await giroService.createGiro(giroInput(w.bank, w.rate), w.admin))
      const saved = await readFresh(Giro, giro.id)

      assert.equal(Number(saved.systemProfit), 10_000)
      assert.equal(Number(saved.minoristaProfit), 0)
      assert.equal(await DI.orm.em.fork().count(MinoristaTransaction), 0)
      assert.deepEqual(await minoristaState(w.minorista.id), { available: 1_000_000, inFavor: 0 })
    })

    dbTest('rechaza un banco destino desconocido', async () => {
      const w = await world()
      const result = await giroService.createGiro(
        giroInput(w.bank, w.rate, { bankId: '00000000-0000-4000-8000-000000000000', minoristaId: w.minorista.id }),
        w.user
      )
      assert.deepEqual(result, { error: 'BANK_NOT_FOUND' })
      assert.equal(await DI.orm.em.fork().count(Giro), 0)
    })

    dbTest('falla sin cobrar al minorista cuando no hay transferencista disponible', async () => {
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

    dbTest('reparte los giros por turnos entre los transferencistas disponibles', async () => {
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
        'los tres primeros giros van a tres transferencistas distintos'
      )
      assert.equal(assigned[3], assigned[0], 'el cuarto giro reinicia el turno')
    })
  })
})

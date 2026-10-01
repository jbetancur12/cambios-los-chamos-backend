import { describe, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { BankAccount } from '@/entities/BankAccount'
import { BankAccountTransaction } from '@/entities/BankAccountTransaction'
import { ExecutionType, Giro, GiroStatus } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import {
  MinoristaTransaction,
  MinoristaTransactionStatus,
  MinoristaTransactionType,
} from '@/entities/MinoristaTransaction'
import { giroService } from '@/services/GiroService'
import { whatsAppNotificationService } from '@/services/WhatsAppNotificationService'
import { setupTestDb, resetTestDb, closeTestDb, dbTest, readFresh, inContext } from './helpers/db'
import {
  createAdmin,
  createAssignmentTracker,
  createBank,
  createBankAccount,
  createMinorista,
  createRate,
  createTransferencista,
  giroInput,
} from './helpers/factories'

const FEE = 10
const AMOUNT_BS = 1_000
const ACCOUNT_BALANCE = 10_000_000

/** An admin, a transferencista with a funded account, and a rate. A minorista is added when needed. */
const world = async () => {
  const admin = await createAdmin()
  const bank = await createBank()
  const rate = await createRate(admin)
  const transferencista = await createTransferencista()
  const account = await createBankAccount(transferencista.transferencista, bank, ACCOUNT_BALANCE)
  await createAssignmentTracker()
  return { admin, bank, rate, transferencista, account }
}

const adminGiro = async (w: Awaited<ReturnType<typeof world>>) => {
  const result = await giroService.createGiro(giroInput(w.bank, w.rate, { amountBs: AMOUNT_BS }), w.admin)
  assert.ok(!('error' in result), `unexpected error: ${JSON.stringify(result)}`)
  return result as Giro
}

const minoristaGiro = async (w: Awaited<ReturnType<typeof world>>) => {
  const m = await createMinorista()
  const result = await giroService.createGiro(
    giroInput(w.bank, w.rate, { amountBs: AMOUNT_BS, minoristaId: m.minorista.id }),
    m.user
  )
  assert.ok(!('error' in result), `unexpected error: ${JSON.stringify(result)}`)
  return { giro: result as Giro, ...m }
}

const execute = (w: Awaited<ReturnType<typeof world>>, giro: Giro) =>
  giroService.executeGiro(giro.id, w.account.id, ExecutionType.TRANSFERENCIA, FEE, w.transferencista.user)

const accountBalance = async (id: string) => Number((await readFresh(BankAccount, id)).balance)

const minoristaState = async (id: string) => {
  const m = await readFresh(Minorista, id)
  return { available: Number(m.availableCredit), inFavor: Number(m.creditBalance) }
}

const transactionsOf = (giroId: string) => DI.orm.em.fork().find(MinoristaTransaction, { giro: giroId })

describe('giroService lifecycle', () => {
  before(async () => {
    // Never call the real WhatsApp API from a test
    mock.method(whatsAppNotificationService, 'notifyGiroCompleted', async () => undefined)
    await setupTestDb()
  })
  beforeEach(resetTestDb)
  after(async () => {
    mock.restoreAll()
    await closeTestDb()
  })

  describe('giroService.executeGiro', () => {
    dbTest('completes the giro and withdraws the amount plus the fee from the account', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      const result = await execute(w, giro)

      assert.ok(!('error' in result), `unexpected error: ${JSON.stringify(result)}`)
      const saved = await readFresh(Giro, giro.id)
      assert.equal(saved.status, GiroStatus.COMPLETADO)
      assert.equal(Number(saved.commission), FEE)
      assert.ok(saved.completedAt, 'completedAt is set')
      assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE - AMOUNT_BS - FEE)
    })

    dbTest('moves the minorista transaction from on hold to completed without touching the balance', async () => {
      const w = await world()
      const { giro, minorista } = await minoristaGiro(w)
      const before = await minoristaState(minorista.id)

      await execute(w, giro)

      const [transaction] = await transactionsOf(giro.id)
      assert.equal(transaction.status, MinoristaTransactionStatus.COMPLETED)
      assert.deepEqual(await minoristaState(minorista.id), before)
    })

    dbTest('a giro that is being processed can still be executed', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      await giroService.markAsProcessing(giro.id, w.transferencista.user)
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.PROCESANDO)

      const result = await execute(w, giro)
      assert.ok(!('error' in result))
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.COMPLETADO)
    })

    dbTest('rejects an account that belongs to another transferencista', async () => {
      const w = await world()
      const giro = await adminGiro(w)
      const other = await createTransferencista()
      const otherAccount = await createBankAccount(other.transferencista, w.bank, ACCOUNT_BALANCE)

      const result = await giroService.executeGiro(
        giro.id,
        otherAccount.id,
        ExecutionType.TRANSFERENCIA,
        FEE,
        w.transferencista.user
      )

      assert.deepEqual(result, { error: 'UNAUTHORIZED_ACCOUNT' })
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.ASIGNADO)
      assert.equal(await accountBalance(otherAccount.id), ACCOUNT_BALANCE)
    })

    dbTest('an admin cannot execute a giro with a transferencista account', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      const result = await giroService.executeGiro(giro.id, w.account.id, ExecutionType.TRANSFERENCIA, FEE, w.admin)

      assert.deepEqual(result, { error: 'UNAUTHORIZED_ACCOUNT' })
      assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE)
    })

    dbTest('a completed giro cannot be executed again', async () => {
      const w = await world()
      const giro = await adminGiro(w)
      await execute(w, giro)

      const second = await execute(w, giro)

      assert.deepEqual(second, { error: 'INVALID_STATUS' })
      assert.equal(
        await accountBalance(w.account.id),
        ACCOUNT_BALANCE - AMOUNT_BS - FEE,
        'the account is debited only once'
      )
    })

    dbTest('reports an unknown giro and an unknown account', async () => {
      const w = await world()
      const giro = await adminGiro(w)
      const missing = '00000000-0000-4000-8000-000000000000'

      assert.deepEqual(
        await giroService.executeGiro(missing, w.account.id, ExecutionType.TRANSFERENCIA, FEE, w.transferencista.user),
        { error: 'GIRO_NOT_FOUND' }
      )
      assert.deepEqual(
        await giroService.executeGiro(giro.id, missing, ExecutionType.TRANSFERENCIA, FEE, w.transferencista.user),
        { error: 'BANK_ACCOUNT_NOT_FOUND' }
      )
    })

    dbTest(
      'two simultaneous executions debit the account only once',
      async () => {
        const w = await world()
        const giro = await adminGiro(w)

        await Promise.allSettled([inContext(() => execute(w, giro)), inContext(() => execute(w, giro))])

        // With the race both runs record a withdrawal (and overwrite each other's balance), so count the movements
        const withdrawals = await DI.orm.em.fork().count(BankAccountTransaction, { bankAccount: w.account.id })
        assert.equal(withdrawals, 1, 'only one withdrawal should be recorded')
        assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE - AMOUNT_BS - FEE)
      },
      { todo: 'Known bug (report): executeGiro checks the status outside any lock, so both executions withdraw' }
    )
  })

  describe('giroService.returnGiro', () => {
    dbTest('marks the giro as returned and gives the minorista the money back', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)
      // After the giro: 1,000,000 - 100,000 + 5,000 = 905,000
      assert.equal((await minoristaState(minorista.id)).available, 905_000)

      const result = await giroService.returnGiro(giro.id, 'Cuenta inválida', user)

      assert.ok(!('error' in result), `unexpected error: ${JSON.stringify(result)}`)
      const saved = await readFresh(Giro, giro.id)
      assert.equal(saved.status, GiroStatus.DEVUELTO)
      assert.equal(saved.returnReason, 'Cuenta inválida')
      // The refund is 95% of the amount (the 5% profit is reverted): 905,000 + 95,000
      assert.deepEqual(await minoristaState(minorista.id), { available: 1_000_000, inFavor: 0 })

      const transactions = await transactionsOf(giro.id)
      const discount = transactions.find((t) => t.type === MinoristaTransactionType.DISCOUNT)
      const refund = transactions.find((t) => t.type === MinoristaTransactionType.REFUND)
      assert.equal(discount?.status, MinoristaTransactionStatus.CANCELLED)
      assert.ok(refund, 'a refund transaction exists')
    })

    dbTest('returning a giro paid partly with balance in favor restores every peso the minorista had', async () => {
      const w = await world()
      const m = await createMinorista({ creditBalance: 50_000 })
      const created = await giroService.createGiro(
        giroInput(w.bank, w.rate, { amountBs: AMOUNT_BS, amountInput: 80_000, minoristaId: m.minorista.id }),
        m.user
      )
      assert.ok(!('error' in created), `unexpected error: ${JSON.stringify(created)}`)
      // 50,000 came from the balance in favor and 30,000 from the credit: 1,000,000 - 30,000 + 4,000
      assert.deepEqual(await minoristaState(m.minorista.id), { available: 974_000, inFavor: 0 })

      await giroService.returnGiro((created as Giro).id, 'Devuelto', m.user)

      // Back to what they had before the giro: full credit and the 50,000 in favor
      assert.deepEqual(await minoristaState(m.minorista.id), { available: 1_000_000, inFavor: 50_000 })
    })

    dbTest('a returned admin giro touches no minorista and no account', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      const result = await giroService.returnGiro(giro.id, 'Datos incorrectos', w.admin)

      assert.ok(!('error' in result))
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.DEVUELTO)
      assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE)
    })

    dbTest('a completed giro cannot be returned and the minorista keeps the same balance', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)
      await execute(w, giro)
      const before = await minoristaState(minorista.id)

      const result = await giroService.returnGiro(giro.id, 'Tarde', user)

      assert.deepEqual(result, { error: 'INVALID_STATUS' })
      assert.deepEqual(await minoristaState(minorista.id), before)
    })

    dbTest('reports an unknown giro', async () => {
      const w = await world()
      assert.deepEqual(await giroService.returnGiro('00000000-0000-4000-8000-000000000000', 'x', w.admin), {
        error: 'GIRO_NOT_FOUND',
      })
    })

    dbTest(
      'two simultaneous returns refund the minorista only once',
      async () => {
        const w = await world()
        const { giro, minorista, user } = await minoristaGiro(w)

        await Promise.allSettled([
          inContext(() => giroService.returnGiro(giro.id, 'a', user)),
          inContext(() => giroService.returnGiro(giro.id, 'b', user)),
        ])

        // One refund brings the credit back to the 1,000,000 limit; a second one would overflow into the balance in favor
        assert.deepEqual(await minoristaState(minorista.id), { available: 1_000_000, inFavor: 0 })
      },
      { todo: 'Known bug (report): returnGiro validates the status before opening the transaction, so both refund' }
    )
  })

  describe('giroService.updateGiro: resending a returned giro', () => {
    /** A minorista with a 100,000 credit whose 80,000 giro was returned, so the credit is full again. */
    const returnedGiro = async () => {
      const w = await world()
      const m = await createMinorista({ creditLimit: 100_000 })
      const created = await giroService.createGiro(
        giroInput(w.bank, w.rate, { amountBs: AMOUNT_BS, amountInput: 80_000, minoristaId: m.minorista.id }),
        m.user
      )
      assert.ok(!('error' in created), `unexpected error: ${JSON.stringify(created)}`)
      await giroService.returnGiro((created as Giro).id, 'Devuelto', m.user)
      assert.deepEqual(await minoristaState(m.minorista.id), { available: 100_000, inFavor: 0 })
      return { w, giro: created as Giro, ...m }
    }

    const spendElsewhere = async (r: Awaited<ReturnType<typeof returnedGiro>>, amountInput: number) => {
      const other = await giroService.createGiro(
        giroInput(r.w.bank, r.w.rate, { amountBs: AMOUNT_BS, amountInput, minoristaId: r.minorista.id }),
        r.user
      )
      assert.ok(!('error' in other), `unexpected error: ${JSON.stringify(other)}`)
    }

    dbTest('resending a returned giro charges the minorista again', async () => {
      const r = await returnedGiro()

      await giroService.updateGiro(r.giro.id, { beneficiaryName: 'Corregido' }, r.user)

      assert.equal((await readFresh(Giro, r.giro.id)).status, GiroStatus.ASIGNADO)
      // 100,000 - 80,000 + 4,000 (5% profit)
      assert.deepEqual(await minoristaState(r.minorista.id), { available: 24_000, inFavor: 0 })
    })

    dbTest('cannot resend a returned giro after spending that credit on another giro', async () => {
      const r = await returnedGiro()
      await spendElsewhere(r, 90_000)
      // 100,000 - 90,000 + 4,500 = 14,500 left, not enough for the 80,000 giro
      assert.deepEqual(await minoristaState(r.minorista.id), { available: 14_500, inFavor: 0 })

      await assert.rejects(
        giroService.updateGiro(r.giro.id, { beneficiaryName: 'Corregido' }, r.user),
        /INSUFFICIENT_BALANCE/
      )

      assert.equal((await readFresh(Giro, r.giro.id)).status, GiroStatus.DEVUELTO, 'the giro stays returned')
      assert.deepEqual(await minoristaState(r.minorista.id), { available: 14_500, inFavor: 0 })
    })

    dbTest('a returned giro can be resent only once', async () => {
      const r = await returnedGiro()
      await giroService.updateGiro(r.giro.id, { beneficiaryName: 'Primera' }, r.user)
      await giroService.updateGiro(r.giro.id, { beneficiaryName: 'Segunda' }, r.user)

      // The second edit does not charge again: the giro is no longer returned
      assert.deepEqual(await minoristaState(r.minorista.id), { available: 24_000, inFavor: 0 })
    })

    dbTest(
      'resending requires the full amount, like creating a giro does',
      async () => {
        const r = await returnedGiro()
        await spendElsewhere(r, 22_000)
        // 100,000 - 22,000 + 1,100 = 79,100: less than the 80,000 giro, so creating it would be rejected
        assert.equal((await minoristaState(r.minorista.id)).available, 79_100)

        await assert.rejects(
          giroService.updateGiro(r.giro.id, { beneficiaryName: 'Corregido' }, r.user),
          /INSUFFICIENT_BALANCE/
        )
      },
      {
        todo: 'Inconsistency: createGiro rejects availableCredit < amount, but resending tolerates a shortfall up to the 5% profit',
      }
    )
  })

  describe('giroService.deleteGiro', () => {
    dbTest('the creator can cancel an assigned giro and gets the money back', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)

      const result = await giroService.deleteGiro(giro.id, user)

      assert.ok(!('error' in result), `unexpected error: ${JSON.stringify(result)}`)
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.CANCELADO)
      assert.deepEqual(await minoristaState(minorista.id), { available: 1_000_000, inFavor: 0 })
    })

    dbTest('another user cannot cancel the giro', async () => {
      const w = await world()
      const { giro, minorista } = await minoristaGiro(w)
      const stranger = await createMinorista()

      const result = await giroService.deleteGiro(giro.id, stranger.user)

      assert.deepEqual(result, { error: 'FORBIDDEN' })
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.ASIGNADO)
      assert.equal((await minoristaState(minorista.id)).available, 905_000)
    })

    dbTest('an admin can cancel a returned giro without refunding twice', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)
      await giroService.returnGiro(giro.id, 'Devuelto', user)
      const afterReturn = await minoristaState(minorista.id)

      const result = await giroService.deleteGiro(giro.id, w.admin)

      assert.ok(!('error' in result), `unexpected error: ${JSON.stringify(result)}`)
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.CANCELADO)
      assert.deepEqual(await minoristaState(minorista.id), afterReturn)
    })

    dbTest('a completed giro cannot be cancelled', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)
      await execute(w, giro)
      const before = await minoristaState(minorista.id)

      assert.deepEqual(await giroService.deleteGiro(giro.id, user), { error: 'INVALID_STATUS' })
      assert.deepEqual(await minoristaState(minorista.id), before)
    })
  })
})

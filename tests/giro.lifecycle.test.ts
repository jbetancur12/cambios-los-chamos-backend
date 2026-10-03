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
  assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
  return result as Giro
}

const minoristaGiro = async (w: Awaited<ReturnType<typeof world>>) => {
  const m = await createMinorista()
  const result = await giroService.createGiro(
    giroInput(w.bank, w.rate, { amountBs: AMOUNT_BS, minoristaId: m.minorista.id }),
    m.user
  )
  assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
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

describe('Ciclo de vida del giro', () => {
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

  describe('Ejecutar giro', () => {
    dbTest('completa el giro y retira de la cuenta el monto más la comisión', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      const result = await execute(w, giro)

      assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
      const saved = await readFresh(Giro, giro.id)
      assert.equal(saved.status, GiroStatus.COMPLETADO)
      assert.equal(Number(saved.commission), FEE)
      assert.ok(saved.completedAt, 'completedAt queda definido')
      assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE - AMOUNT_BS - FEE)
    })

    dbTest('pasa la transacción del minorista de en espera a completada sin tocar el saldo', async () => {
      const w = await world()
      const { giro, minorista } = await minoristaGiro(w)
      const before = await minoristaState(minorista.id)

      await execute(w, giro)

      const [transaction] = await transactionsOf(giro.id)
      assert.equal(transaction.status, MinoristaTransactionStatus.COMPLETED)
      assert.deepEqual(await minoristaState(minorista.id), before)
    })

    dbTest('un giro en procesamiento todavía se puede ejecutar', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      await giroService.markAsProcessing(giro.id, w.transferencista.user)
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.PROCESANDO)

      const result = await execute(w, giro)
      assert.ok(!('error' in result))
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.COMPLETADO)
    })

    dbTest('rechaza una cuenta que pertenece a otro transferencista', async () => {
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

    dbTest('un admin no puede ejecutar un giro con una cuenta de transferencista', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      const result = await giroService.executeGiro(giro.id, w.account.id, ExecutionType.TRANSFERENCIA, FEE, w.admin)

      assert.deepEqual(result, { error: 'UNAUTHORIZED_ACCOUNT' })
      assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE)
    })

    dbTest('un giro completado no se puede ejecutar de nuevo', async () => {
      const w = await world()
      const giro = await adminGiro(w)
      await execute(w, giro)

      const second = await execute(w, giro)

      assert.deepEqual(second, { error: 'INVALID_STATUS' })
      assert.equal(
        await accountBalance(w.account.id),
        ACCOUNT_BALANCE - AMOUNT_BS - FEE,
        'la cuenta se descuenta una sola vez'
      )
    })

    dbTest('informa cuando el giro o la cuenta no existen', async () => {
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

    dbTest('dos ejecuciones simultáneas descuentan la cuenta una sola vez', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      await Promise.allSettled([inContext(() => execute(w, giro)), inContext(() => execute(w, giro))])

      // With the race both runs record a withdrawal (and overwrite each other's balance), so count the movements
      const withdrawals = await DI.orm.em.fork().count(BankAccountTransaction, { bankAccount: w.account.id })
      assert.equal(withdrawals, 1, 'debe registrarse un solo retiro')
      assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE - AMOUNT_BS - FEE)
    })
  })

  describe('Devolver giro', () => {
    dbTest('marca el giro como devuelto y le devuelve el dinero al minorista', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)
      // After the giro: 1,000,000 - 100,000 + 5,000 = 905,000
      assert.equal((await minoristaState(minorista.id)).available, 905_000)

      const result = await giroService.returnGiro(giro.id, 'Cuenta inválida', w.admin)

      assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
      const saved = await readFresh(Giro, giro.id)
      assert.equal(saved.status, GiroStatus.DEVUELTO)
      assert.equal(saved.returnReason, 'Cuenta inválida')
      // The refund is 95% of the amount (the 5% profit is reverted): 905,000 + 95,000
      assert.deepEqual(await minoristaState(minorista.id), { available: 1_000_000, inFavor: 0 })

      const transactions = await transactionsOf(giro.id)
      const discount = transactions.find((t) => t.type === MinoristaTransactionType.DISCOUNT)
      const refund = transactions.find((t) => t.type === MinoristaTransactionType.REFUND)
      assert.equal(discount?.status, MinoristaTransactionStatus.CANCELLED)
      assert.ok(refund, 'existe una transacción de reembolso')
    })

    dbTest('devolver un giro pagado en parte con saldo a favor restituye todo lo que tenía el minorista', async () => {
      const w = await world()
      const m = await createMinorista({ creditBalance: 50_000 })
      const created = await giroService.createGiro(
        giroInput(w.bank, w.rate, { amountBs: AMOUNT_BS, amountInput: 80_000, minoristaId: m.minorista.id }),
        m.user
      )
      assert.ok(!('error' in created), `error inesperado: ${JSON.stringify(created)}`)
      // 50,000 came from the balance in favor and 30,000 from the credit: 1,000,000 - 30,000 + 4,000
      assert.deepEqual(await minoristaState(m.minorista.id), { available: 974_000, inFavor: 0 })

      await giroService.returnGiro((created as Giro).id, 'Devuelto', w.admin)

      // Back to what they had before the giro: full credit and the 50,000 in favor
      assert.deepEqual(await minoristaState(m.minorista.id), { available: 1_000_000, inFavor: 50_000 })
    })

    dbTest('un giro de admin devuelto no toca ningún minorista ni ninguna cuenta', async () => {
      const w = await world()
      const giro = await adminGiro(w)

      const result = await giroService.returnGiro(giro.id, 'Datos incorrectos', w.admin)

      assert.ok(!('error' in result))
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.DEVUELTO)
      assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE)
    })

    dbTest('un giro completado no se puede devolver y el minorista conserva su saldo', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)
      await execute(w, giro)
      const before = await minoristaState(minorista.id)

      const result = await giroService.returnGiro(giro.id, 'Tarde', w.admin)

      assert.deepEqual(result, { error: 'INVALID_STATUS' })
      assert.deepEqual(await minoristaState(minorista.id), before)
    })

    dbTest('informa cuando el giro no existe', async () => {
      const w = await world()
      assert.deepEqual(await giroService.returnGiro('00000000-0000-4000-8000-000000000000', 'x', w.admin), {
        error: 'GIRO_NOT_FOUND',
      })
    })

    dbTest('dos devoluciones simultáneas reembolsan al minorista una sola vez', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)

      await Promise.allSettled([
        inContext(() => giroService.returnGiro(giro.id, 'a', w.admin)),
        inContext(() => giroService.returnGiro(giro.id, 'b', w.admin)),
      ])

      // One refund brings the credit back to the 1,000,000 limit; a second one would overflow into the balance in favor
      assert.deepEqual(await minoristaState(minorista.id), { available: 1_000_000, inFavor: 0 })
    })
  })

  describe('Editar giro: reenviar un giro devuelto', () => {
    /** A minorista with a 100,000 credit whose 80,000 giro was returned, so the credit is full again. */
    const returnedGiro = async () => {
      const w = await world()
      const m = await createMinorista({ creditLimit: 100_000 })
      const created = await giroService.createGiro(
        giroInput(w.bank, w.rate, { amountBs: AMOUNT_BS, amountInput: 80_000, minoristaId: m.minorista.id }),
        m.user
      )
      assert.ok(!('error' in created), `error inesperado: ${JSON.stringify(created)}`)
      await giroService.returnGiro((created as Giro).id, 'Devuelto', w.admin)
      assert.deepEqual(await minoristaState(m.minorista.id), { available: 100_000, inFavor: 0 })
      return { w, giro: created as Giro, ...m }
    }

    const spendElsewhere = async (r: Awaited<ReturnType<typeof returnedGiro>>, amountInput: number) => {
      const other = await giroService.createGiro(
        giroInput(r.w.bank, r.w.rate, { amountBs: AMOUNT_BS, amountInput, minoristaId: r.minorista.id }),
        r.user
      )
      assert.ok(!('error' in other), `error inesperado: ${JSON.stringify(other)}`)
    }

    dbTest('reenviar un giro devuelto le cobra de nuevo al minorista', async () => {
      const r = await returnedGiro()

      await giroService.updateGiro(r.giro.id, { beneficiaryName: 'Corregido' }, r.user)

      assert.equal((await readFresh(Giro, r.giro.id)).status, GiroStatus.ASIGNADO)
      // 100,000 - 80,000 + 4,000 (5% profit)
      assert.deepEqual(await minoristaState(r.minorista.id), { available: 24_000, inFavor: 0 })
    })

    dbTest('no se puede reenviar un giro devuelto después de gastar ese crédito en otro giro', async () => {
      const r = await returnedGiro()
      await spendElsewhere(r, 90_000)
      // 100,000 - 90,000 + 4,500 = 14,500 left, not enough for the 80,000 giro
      assert.deepEqual(await minoristaState(r.minorista.id), { available: 14_500, inFavor: 0 })

      await assert.rejects(
        giroService.updateGiro(r.giro.id, { beneficiaryName: 'Corregido' }, r.user),
        /INSUFFICIENT_BALANCE/
      )

      assert.equal((await readFresh(Giro, r.giro.id)).status, GiroStatus.DEVUELTO, 'el giro sigue devuelto')
      assert.deepEqual(await minoristaState(r.minorista.id), { available: 14_500, inFavor: 0 })
    })

    dbTest('un giro devuelto solo se puede reenviar una vez', async () => {
      const r = await returnedGiro()
      await giroService.updateGiro(r.giro.id, { beneficiaryName: 'Primera' }, r.user)
      await giroService.updateGiro(r.giro.id, { beneficiaryName: 'Segunda' }, r.user)

      // The second edit does not charge again: the giro is no longer returned
      assert.deepEqual(await minoristaState(r.minorista.id), { available: 24_000, inFavor: 0 })
    })

    dbTest(
      'reenviar exige el monto completo, igual que crear un giro',
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
        todo: 'Inconsistencia: createGiro rechaza availableCredit menor al monto, pero reenviar tolera un faltante de hasta el 5% de ganancia',
      }
    )
  })

  describe('acciones simultáneas', () => {
    dbTest(
      'de dos ejecuciones simultáneas del mismo giro, la que llega segunda se rechaza con estado inválido',
      async () => {
        const w = await world()
        const giro = await adminGiro(w)

        const resultados = await Promise.all([inContext(() => execute(w, giro)), inContext(() => execute(w, giro))])

        assert.equal(resultados.filter((r) => !('error' in r)).length, 1, 'solo una se completa')
        assert.deepEqual(
          resultados.find((r) => 'error' in r),
          { error: 'INVALID_STATUS' }
        )
      }
    )

    dbTest('de dos devoluciones simultáneas, la segunda se rechaza con estado inválido', async () => {
      const w = await world()
      const { giro } = await minoristaGiro(w)

      const resultados = await Promise.all([
        inContext(() => giroService.returnGiro(giro.id, 'a', w.admin)),
        inContext(() => giroService.returnGiro(giro.id, 'b', w.admin)),
      ])

      assert.equal(resultados.filter((r) => !('error' in r)).length, 1)
      assert.deepEqual(
        resultados.find((r) => 'error' in r),
        { error: 'INVALID_STATUS' }
      )
    })

    dbTest('dos cancelaciones simultáneas reembolsan al minorista una sola vez', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)

      await Promise.allSettled([
        inContext(() => giroService.deleteGiro(giro.id, user)),
        inContext(() => giroService.deleteGiro(giro.id, user)),
      ])

      assert.deepEqual(await minoristaState(minorista.id), { available: 1_000_000, inFavor: 0 })
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.CANCELADO)
    })

    dbTest('ejecutar y devolver el mismo giro a la vez: gana una sola y el dinero queda coherente', async () => {
      const w = await world()
      const { giro, minorista } = await minoristaGiro(w)

      const [ejecucion, devolucion] = await Promise.all([
        inContext(() => execute(w, giro)),
        inContext(() => giroService.returnGiro(giro.id, 'Cuenta inválida', w.admin)),
      ])

      const ganoEjecutar = !('error' in ejecucion)
      const ganoDevolver = !('error' in devolucion)
      assert.notEqual(ganoEjecutar, ganoDevolver, 'exactamente una de las dos gana')

      const retiros = await DI.orm.em.fork().count(BankAccountTransaction, { bankAccount: w.account.id })
      const estado = (await readFresh(Giro, giro.id)).status
      if (ganoEjecutar) {
        assert.equal(estado, GiroStatus.COMPLETADO)
        assert.equal(retiros, 1)
        assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE - AMOUNT_BS - FEE)
        assert.equal((await minoristaState(minorista.id)).available, 905_000, 'el minorista no recibe reembolso')
      } else {
        assert.equal(estado, GiroStatus.DEVUELTO)
        assert.equal(retiros, 0, 'no se retiró nada de la cuenta')
        assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE)
        assert.equal((await minoristaState(minorista.id)).available, 1_000_000, 'el minorista recupera su dinero')
      }
    })

    dbTest(
      'dos giros distintos ejecutados a la vez con la misma cuenta no pierden ninguno de los dos retiros',
      async () => {
        const w = await world()
        const primero = await adminGiro(w)
        const segundo = await adminGiro(w)

        const resultados = await Promise.all([
          inContext(() => execute(w, primero)),
          inContext(() => execute(w, segundo)),
        ])

        assert.ok(
          resultados.every((r) => !('error' in r)),
          'las dos se completan'
        )
        assert.equal(await DI.orm.em.fork().count(BankAccountTransaction, { bankAccount: w.account.id }), 2)
        assert.equal(
          await accountBalance(w.account.id),
          ACCOUNT_BALANCE - 2 * (AMOUNT_BS + FEE),
          'el saldo refleja los dos retiros'
        )
      }
    )

    dbTest('el saldo de la cuenta cuadra con sus movimientos después de ejecutar varios giros a la vez', async () => {
      const w = await world()
      const giros = [await adminGiro(w), await adminGiro(w), await adminGiro(w), await adminGiro(w)]

      await Promise.all(giros.map((g) => inContext(() => execute(w, g))))

      const movimientos = await DI.orm.em.fork().find(BankAccountTransaction, { bankAccount: w.account.id })
      assert.equal(movimientos.length, 4)
      const retirado = movimientos.reduce((suma, m) => suma + Number(m.amount) + Number(m.fee), 0)
      assert.equal(await accountBalance(w.account.id), ACCOUNT_BALANCE - retirado)
    })

    dbTest('ejecutar giros distintos en paralelo no se bloquea entre sí', async () => {
      const w = await world()
      const giros = [await adminGiro(w), await adminGiro(w), await adminGiro(w)]

      const inicio = Date.now()
      const resultados = await Promise.all(giros.map((g) => inContext(() => execute(w, g))))

      assert.ok(resultados.every((r) => !('error' in r)))
      assert.ok(Date.now() - inicio < 20_000, 'terminan sin esperar indefinidamente')
    })
  })

  describe('Cancelar giro', () => {
    dbTest('quien lo creó puede cancelar un giro asignado y recupera el dinero', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)

      const result = await giroService.deleteGiro(giro.id, user)

      assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.CANCELADO)
      assert.deepEqual(await minoristaState(minorista.id), { available: 1_000_000, inFavor: 0 })
    })

    dbTest('otro usuario no puede cancelar el giro', async () => {
      const w = await world()
      const { giro, minorista } = await minoristaGiro(w)
      const stranger = await createMinorista()

      const result = await giroService.deleteGiro(giro.id, stranger.user)

      assert.deepEqual(result, { error: 'FORBIDDEN' })
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.ASIGNADO)
      assert.equal((await minoristaState(minorista.id)).available, 905_000)
    })

    dbTest('un admin puede cancelar un giro devuelto sin reembolsar dos veces', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)
      await giroService.returnGiro(giro.id, 'Devuelto', w.admin)
      const afterReturn = await minoristaState(minorista.id)

      const result = await giroService.deleteGiro(giro.id, w.admin)

      assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
      assert.equal((await readFresh(Giro, giro.id)).status, GiroStatus.CANCELADO)
      assert.deepEqual(await minoristaState(minorista.id), afterReturn)
    })

    dbTest('un giro completado no se puede cancelar', async () => {
      const w = await world()
      const { giro, minorista, user } = await minoristaGiro(w)
      await execute(w, giro)
      const before = await minoristaState(minorista.id)

      assert.deepEqual(await giroService.deleteGiro(giro.id, user), { error: 'INVALID_STATUS' })
      assert.deepEqual(await minoristaState(minorista.id), before)
    })
  })
})

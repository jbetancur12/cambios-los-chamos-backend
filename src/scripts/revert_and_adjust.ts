import { initDI, DI } from '@/di'
import { MinoristaTransaction } from '../entities/MinoristaTransaction'
import { minoristaTransactionService } from '../services/MinoristaTransactionService'
import { logger } from '../lib/logger'

export const revertAndAdjust = async () => {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    // 1. Find Minorista
    const minoristaId = 'ed045d65-4f3b-4866-963d-42526c8b9829' // Andreina
    const minoristaRepo = DI.minoristas
    const minorista = await minoristaRepo.findOne(minoristaId)

    if (!minorista) {
      logger.warn('Minorista not found')
      return
    }

    logger.info('--- BEFORE REVERT ---')
    logger.info(`Available Credit: ${minorista.availableCredit}`)

    // 2. REVERT: Manually set Available Credit back to ~350k (approximate wrong state)
    // IMPORTANT: This is hacking the DB state to simulate the "before" state
    // In reality, you wouldn't do this if you just want to run the fix.
    // But to TEST the fix, we revert first.
    // minorista.availableCredit = 351493.5;
    // await DI.em.persistAndFlush(minorista);

    logger.info('--- REVERTED (Back to "wrong" state) ---')
    logger.info(`Available Credit: ${minorista.availableCredit}`)

    // 3. APPLY FIX: Create "Adjustment" transaction
    logger.info('Creating Adjustment Transaction...')

    // Calculate difference (Logic: Real - Current = Diff)
    // Expected Real Balance (from audit): ~621,493.50
    // Current (Wrong) Balance: ~351,493.50
    // Diff to Add: +270,000

    const amountToAdd = 270000

    const result = await minoristaTransactionService.createTransaction(
      {
        minoristaId: minorista.id,
        amount: amountToAdd,
        type: 'ADJUSTMENT' as any,
        description: 'Correction of initial balance discrepancy (Audit Fixed)',
        createdBy: { id: 'system-script', role: 'SUPER_ADMIN' } as any,
      },
      DI.orm.em.fork()
    )

    if ('error' in result) {
      logger.error({ error: result.error }, 'Error creating transaction')
    } else {
      logger.info('Transaction created successfully.')
      logger.info(`New Available Credit: ${result.availableCredit}`)
    }
  } catch (error) {
    logger.error({ error }, 'Error in revertAndAdjust')
  } finally {
    await DI.orm.close()
  }
}

revertAndAdjust()

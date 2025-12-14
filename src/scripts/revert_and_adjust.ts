import { initDI, DI } from '@/di'
import { User } from '@/entities/User'
import { minoristaTransactionService } from '@/services/MinoristaTransactionService'
import { MinoristaTransactionType } from '@/entities/MinoristaTransaction'

async function fixHistory() {
    await initDI()
    const em = DI.orm.em.fork()

    try {
        const user = await em.findOne(User, { email: 'nathalypea@gmail.com' }, { populate: ['minorista'] })
        if (!user || !user.minorista) {
            console.log('Minorista not found')
            return
        }

        const minorista = user.minorista
        console.log('--- BEFORE REVERT ---')
        console.log(`Available Credit: ${minorista.availableCredit}`)

        // 1. Revert the manual change (Add 200k back)
        // We do this purely so the transaction service calculates the "Before" and "After" correctly relative to the "wrong" high state,
        // and then the Adjustment brings it down to the "correct" low state.
        minorista.availableCredit += 200000
        await em.persistAndFlush(minorista)

        console.log('--- REVERTED (Back to "wrong" state) ---')
        console.log(`Available Credit: ${minorista.availableCredit}`)

        // 2. Create Adjustment Transaction
        console.log('Creating Adjustment Transaction...')
        const result = await minoristaTransactionService.createTransaction({
            minoristaId: minorista.id,
            amount: -200000, // Negative to reduce available credit (increase debt)
            type: MinoristaTransactionType.ADJUSTMENT,
            createdBy: user, // Attributing to self or system? usage of user is fine.
            // status: COMPLETED (default)
        }, em) // Pass em? Or let service use DI.em? Service uses DI.em if not passed. 
        // But acts on "fresh" entity from DB.
        // Since we just updated minorista, we should probably pass the em OR make sure service fetches fresh.
        // The service fetches fresh: "const minorista = await minoristaRepo.findOne..."
        // So passing em is safer to ensure it sees the update if within same transaction, but here we flushed.
        // We'll let it run its course.

        if ('error' in result) {
            console.error('Error creating transaction:', result.error)
        } else {
            console.log('Transaction created successfully.')
            console.log(`New Available Credit: ${result.availableCredit}`)
        }

    } catch (error) {
        console.error(error)
    } finally {
        await DI.orm.close()
    }
}

fixHistory()

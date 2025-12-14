import { initDI, DI } from '@/di'
import { User } from '@/entities/User'
import { Minorista } from '@/entities/Minorista'

async function fixBalance() {
    await initDI()
    const em = DI.orm.em.fork()

    try {
        const user = await em.findOne(User, { email: 'nathalypea@gmail.com' }, { populate: ['minorista'] })
        if (!user || !user.minorista) {
            console.log('Minorista not found')
            return
        }

        const minorista = user.minorista
        console.log('--- BEFORE ---')
        console.log(`Available Credit: ${minorista.availableCredit}`)
        console.log(`Credit Balance (Surplus): ${minorista.creditBalance}`)
        console.log(`Credit Limit: ${minorista.creditLimit}`)

        // Fix: Subtract 200,000 from availableCredit
        minorista.availableCredit -= 200000

        // Normalize if needed? 
        // If fixing it makes it consistent with "previous logic", we just subtract.
        // If the 200k was added to availableCredit incorrectly (ignoring limit), we subtract it from there.

        console.log('--- AFTER (Preview) ---')
        console.log(`Available Credit: ${minorista.availableCredit}`)

        // Persist
        await em.persistAndFlush(minorista)
        console.log('Balance adjusted successfully.')

    } catch (error) {
        console.error(error)
    } finally {
        await DI.orm.close()
    }
}

fixBalance()

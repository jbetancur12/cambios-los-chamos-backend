
import { DI } from './src/di'
import { MikroORM } from '@mikro-orm/core'
import { User } from './src/entities/User'
import { Minorista } from './src/entities/Minorista'
import { MinoristaTransaction } from './src/entities/MinoristaTransaction'
import { Giro, GiroStatus } from './src/entities/Giro'
import config from './src/mikro-orm.config'

async function auditMinoristaGeneral() {
    const searchTerm = process.argv[2]
    if (!searchTerm) {
        console.error('Please provide a name to search for. Usage: npx ts-node audit_minorista_general.ts "Name Pattern"')
        process.exit(1)
    }

    const orm = await MikroORM.init(config)
    const em = orm.em.fork()

    try {
        console.log(`--- AUDIT SEARCH: "${searchTerm}" ---`)

        // 1. Find User/Minorista
        const user = await em.findOne(User, { fullName: { $like: `%${searchTerm}%` } })
        if (!user) {
            console.error(`No user found matching "${searchTerm}"`)
            return
        }
        const minorista = await em.findOne(Minorista, { user: user.id })
        if (!minorista) {
            console.error('Minorista profile not found for user', user.fullName)
            return
        }

        console.log(`Minorista ID: ${minorista.id}`)
        console.log(`User: ${user.fullName} (${user.email})`)

        // 2. Current Status
        console.log('\n--- CURRENT DB STATE ---')
        console.log('Credit Limit (Cupo):', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(minorista.creditLimit))
        console.log('Available Credit (Disponible):', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(minorista.availableCredit))
        console.log('Credit Balance (Saldo a Favor):', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(minorista.creditBalance ?? 0))

        const totalAvailable = minorista.availableCredit + (minorista.creditBalance || 0)

        // 3. Pending Giros
        const pendingGiros = await em.find(Giro, {
            minorista: minorista.id,
            status: { $in: [GiroStatus.PENDIENTE, GiroStatus.ASIGNADO, GiroStatus.PROCESANDO] }
        })
        const pendingTotal = pendingGiros.reduce((sum, g) => sum + g.amountInput, 0)
        console.log(`\n--- PENDING GIROS (${pendingGiros.length}) ---`)
        if (pendingGiros.length > 0) {
            console.log('Total Pending Amount:', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(pendingTotal))
        } else {
            console.log('Total Pending Amount: $0')
        }

        // 4. Consolidated Net Stats
        const allTransactions = await em.find(MinoristaTransaction, { minorista: minorista.id })
        const sortedTransactions = allTransactions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

        console.log('\n--- TRANSACTION HISTORY (Sorted) ---')
        console.log(`Found ${allTransactions.length} transactions.`)

        let signedAmountSum = 0
        let totalProfit = 0
        let cancelledCount = 0

        sortedTransactions.forEach(t => {
            const rawAmount = Number(t.amount)
            const profit = Number(t.profitEarned || 0)
            let sign = ''
            let typeLabel = t.type
            const dateStr = new Date(t.createdAt).toISOString().split('T')[0]

            // Check for CANCELLED status (assuming string literal as per entity default check usually works if enum matches string)
            // Even if it is enum, it compares to string 'CANCELLED' in JS. 
            if (t.status === 'CANCELLED') {
                console.log(`[${dateStr}] [CANCELLED] ${typeLabel.padEnd(10)} | Amount: ${rawAmount} (IGNORED)`)
                cancelledCount++
                return // SKIP THIS TRANSACTION
            }

            // Sum Profits (Always Positive)
            totalProfit += profit

            // Sum Amounts based on Type (Sign)
            let currentImpact = 0
            switch (t.type) {
                case 'RECHARGE':
                    currentImpact = rawAmount
                    sign = '+'
                    break
                case 'REFUND':
                    currentImpact = rawAmount
                    sign = '+'
                    break
                case 'DISCOUNT':
                    currentImpact = -rawAmount
                    sign = '-'
                    break
                case 'ADJUSTMENT':
                    currentImpact = rawAmount
                    sign = '+'
                    break
            }

            signedAmountSum += currentImpact

            console.log(`[${dateStr}] ${typeLabel.padEnd(10)} | Amount: ${sign}${rawAmount} | Profit: ${profit}`)
        })

        const netResult = signedAmountSum + totalProfit

        console.log('\n--- CALCULATED TOTALS ---')
        console.log(`Ignored ${cancelledCount} CANCELLED transactions.`)
        console.log('Sum of Signed Amounts (Montos con Signo):', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(signedAmountSum))
        console.log('Sum of Profits (Ganancias):', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(totalProfit))
        console.log('--------------------------------------------------')
        console.log('RESULTADO NETO (Montos + Ganancias):', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(netResult))

        // Check against current debt
        console.log('\n--- CONSISTENCY CHECK ---')
        console.log('Net Balance calculated from history:', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(netResult))

        // Final diff
        // Net Balance in DB = (Available + Favor) - Limit
        const currentNetDB = (minorista.availableCredit + (minorista.creditBalance || 0)) - minorista.creditLimit
        console.log('Current Net Balance (DB):', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(currentNetDB))

        const diff = currentNetDB - netResult
        console.log('Difference (DB - History):', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(diff))

    } catch (error) {
        console.error('Error during audit:', error)
    } finally {
        await orm.close()
    }
}

auditMinoristaGeneral()

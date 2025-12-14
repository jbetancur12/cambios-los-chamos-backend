
import { DI } from './src/di'
import { MikroORM } from '@mikro-orm/core'
import { User } from './src/entities/User'
import { Minorista } from './src/entities/Minorista'
import { MinoristaTransaction } from './src/entities/MinoristaTransaction'
import { Giro, GiroStatus } from './src/entities/Giro'
import config from './src/mikro-orm.config'

async function auditStefanny() {
    const orm = await MikroORM.init(config)
    const em = orm.em.fork()

    try {
        console.log('--- START AUDIT STEFANNY TOLEDO ---')

        // 1. Find User/Minorista
        const user = await em.findOne(User, { fullName: { $like: '%Stefanny Toledo%' } })
        if (!user) {
            console.error('User Stefanny Toledo not found')
            return
        }
        const minorista = await em.findOne(Minorista, { user: user.id })
        if (!minorista) {
            console.error('Minorista profile not found for user', user.id)
            return
        }

        console.log(`Minorista ID: ${minorista.id}`)
        console.log(`User: ${user.fullName} (${user.email})`)
        console.log('--- CURRENT DB STATE ---')
        console.log('Credit Limit (Cupo):', minorista.creditLimit)
        console.log('Available Credit (Disponible En BD):', minorista.availableCredit)
        console.log('Credit Balance (Saldo a Favor En BD):', minorista.creditBalance)

        // Net Liquidity Calculation
        const totalAvailableLiquidity = minorista.availableCredit + (minorista.creditBalance || 0)
        const netBalance = totalAvailableLiquidity - minorista.creditLimit

        console.log('--- NET LIQUIDITY (CALCULATED) ---')
        console.log('Total Available (Disp + Favor):', totalAvailableLiquidity)
        console.log('Net Balance (Total - Limit):', netBalance)
        if (netBalance < 0) {
            console.log('IMPLIED DEBT (Deuda Actual):', Math.abs(netBalance))
        } else {
            console.log('REAL FAVOR (Saldo a Favor Real):', netBalance)
        }

        // 2. Pending Giros (Reserved but not transacted yet if execution logic holds)
        // Wait, usually they are deducted from 'availableCredit' immediately upon creation?
        // Let's check pending giros
        const pendingGiros = await em.find(Giro, {
            minorista: minorista.id,
            status: { $in: [GiroStatus.PENDIENTE, GiroStatus.ASIGNADO, GiroStatus.PROCESANDO] }
        })

        const pendingTotal = pendingGiros.reduce((sum, g) => sum + g.amountInput, 0)
        console.log('--- PENDING GIROS ---')
        console.log('Count:', pendingGiros.length)
        console.log('Total Amount (Pending):', pendingTotal)
        pendingGiros.forEach(g => {
            console.log(` - ID: ${g.id} | Status: ${g.status} | Amount: ${g.amountInput} | Date: ${g.createdAt.toISOString()}`)
        })

        // 3. Transactions History
        const transactions = await em.find(MinoristaTransaction, { minorista: minorista.id }, { orderBy: { createdAt: 'DESC' } })

        console.log('--- TRANSACTION HISTORY (LAST 10) ---')
        transactions.slice(0, 10).forEach(t => {
            console.log(` - ${t.createdAt.toISOString()} | Type: ${t.type} | Amount: ${t.amount} | PrevAvail: ${t.previousAvailableCredit} | AvailCred: ${t.availableCredit} | PrevFavor: ${t.previousBalanceInFavor ?? 'N/A'} | CurrFavor: ${t.currentBalanceInFavor ?? 'N/A'}`)
        })

        // 5. December Analysis
        const startOfMonth = new Date('2025-12-01T00:00:00.000Z')
        const endOfMonth = new Date('2026-01-01T00:00:00.000Z')

        const decTransactions = await em.find(MinoristaTransaction, {
            minorista: minorista.id,
            createdAt: { $gte: startOfMonth, $lt: endOfMonth }
        })

        console.log('--- DECEMBER 2025 SUMMARY ---')
        console.log('Total Transactions in Dec:', decTransactions.length)

        // Sum Discounts (Giros Sent)
        const totalGirosSent = decTransactions
            .filter(t => t.type === 'DISCOUNT')
            .reduce((sum, t) => sum + Number(t.amount), 0)

        // Sum Recharges (Payments made)
        const totalRecharges = decTransactions
            .filter(t => t.type === 'RECHARGE')
            .reduce((sum, t) => sum + Number(t.amount), 0)

        // Sum Profit (Ganancias)
        const totalProfit = decTransactions
            .reduce((sum, t) => sum + (Number(t.profitEarned) || 0), 0)

        console.log('Total Giros Sent (DISCOUNT):', totalGirosSent)
        console.log('Total Recharges (PAYMENTS):', totalRecharges)
        console.log('Total Profit (GANANCIAS):', totalProfit)

        // 4. Mathematical Reconstruction
        // Start from 0 and replay transactions? Or just sum them up?
        // Let's try to sum "Recharges" vs "Discounts" + "Refunds"
        // Note: Transaction logic is complex, just listing might be enough for visual check.

    } catch (error) {
        console.error('Error during audit:', error)
    } finally {
        await orm.close()
    }
}

auditStefanny()

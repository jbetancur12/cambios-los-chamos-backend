
import 'dotenv/config'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import config from '../mikro-orm.config'
import { Minorista } from '../entities/Minorista'
import { MinoristaTransaction, MinoristaTransactionType, MinoristaTransactionStatus } from '../entities/MinoristaTransaction'
import { User } from '../entities/User'

async function main() {
    // Arguments: email startDate(YYYY-MM-DD) endDate(YYYY-MM-DD) initialBalance
    const args = process.argv.slice(2)
    if (args.length < 4) {
        console.log('Usage: npx tsx src/scripts/audit_custom_period.ts <email> <startDate> <endDate> <initialBalance>')
        console.log('Example: npx tsx src/scripts/audit_custom_period.ts user@example.com 2025-12-16 2025-12-16 -63233.5')
        process.exit(1)
    }

    const [email, startDateStr, endDateStr, initialBalanceStr] = args
    const initialBalance = parseFloat(initialBalanceStr)

    if (isNaN(initialBalance)) {
        console.error('Invalid initial balance')
        process.exit(1)
    }

    const orm = await MikroORM.init<PostgreSqlDriver>(config)
    const em = orm.em.fork()

    const user = await em.findOne(User, { email })
    if (!user) {
        console.log('User not found')
        process.exit(1)
    }
    const minorista = await em.findOne(Minorista, { user: user.id })
    if (!minorista) {
        console.log('Minorista not found')
        process.exit(1)
    }

    // Construct dates with Colombia Timezone logic
    // Start: 00:00:00 of startDate
    // End: 23:59:59 of endDate
    // We assume input is YYYY-MM-DD
    const start = new Date(`${startDateStr}T00:00:00-05:00`)
    const end = new Date(`${endDateStr}T23:59:59.999-05:00`)

    console.log(`\nAuditando: ${email}`)
    console.log(`Periodo: ${startDateStr} - ${endDateStr}`)
    console.log(`Saldo Inicial Manual: ${initialBalance}`)
    console.log('----------------------------------------------------------------')

    const transactions = await em.find(MinoristaTransaction, {
        minorista: minorista.id,
        status: MinoristaTransactionStatus.COMPLETED,
        createdAt: { $gte: start, $lte: end }
    }, {
        orderBy: { createdAt: 'ASC' },
        populate: ['giro'] // To see giro details if needed
    })

    let currentBalance = initialBalance
    let totalDebits = 0
    let totalCredits = 0
    let totalProfits = 0

    const currencyFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })
    const dateFmt = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        dateStyle: 'short',
        timeStyle: 'medium'
    })

    console.log(`FECHA                 | TIPO       | MONTO           | GANANCIA      | SALDO RESULTANTE`)
    console.log('---------------------------------------------------------------------------------------')

    for (const t of transactions) {
        let movement = 0
        const profit = t.profitEarned || 0

        if (t.type === MinoristaTransactionType.DISCOUNT || t.type === MinoristaTransactionType.ADJUSTMENT) {
            // Debits: Subtract amount, Add profit (because profit reduces the effective cost)
            // Effective reduction = Amount - Profit
            // Movement = -(Amount - Profit) = -Amount + Profit
            movement = -t.amount + profit
            totalDebits += t.amount
            totalProfits += profit
        } else if (t.type === MinoristaTransactionType.RECHARGE || t.type === MinoristaTransactionType.REFUND) {
            // Credits: Add amount directly
            movement = t.amount
            totalCredits += t.amount
        }

        currentBalance += movement

        const dateStr = dateFmt.format(t.createdAt)
        const typeStr = t.type.padEnd(10)
        const amountStr = currencyFmt.format(t.amount).padStart(15)
        const profitStr = currencyFmt.format(profit).padStart(13)
        const balanceStr = currencyFmt.format(currentBalance).padStart(16)

        console.log(`${dateStr} | ${typeStr} | ${amountStr} | ${profitStr} | ${balanceStr}`)
    }

    console.log('---------------------------------------------------------------------------------------')
    console.log('RESUMEN DEL PERIODO:')
    console.log(`Saldo Inicial:        ${currencyFmt.format(initialBalance)}`)
    console.log(`Total Giros (Débitos):-${currencyFmt.format(totalDebits)}`)
    console.log(`Total Ganancias:      +${currencyFmt.format(totalProfits)}`)
    console.log(`Total Abonos/Refunds: +${currencyFmt.format(totalCredits)}`)
    console.log('---------------------')
    console.log(`SALDO FINAL:          ${currencyFmt.format(currentBalance)}`)

    await orm.close()
}

main().catch(console.error)

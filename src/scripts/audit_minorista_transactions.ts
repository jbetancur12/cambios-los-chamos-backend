import { MikroORM, FilterQuery } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import config from '../mikro-orm.config'
import { MinoristaTransaction, MinoristaTransactionStatus, MinoristaTransactionType } from '../entities/MinoristaTransaction'
import { User } from '../entities/User'
import { Minorista } from '../entities/Minorista'

async function auditMinorista() {
    const email = process.argv[2]
    const dateStr = process.argv[3] // Optional: DD-MM-YYYY

    if (!email) {
        console.error('Por favor proporciona el email del minorista.')
        console.error('Uso: npx tsx src/scripts/audit_minorista_transactions.ts <email> [dd-mm-yyyy]')
        process.exit(1)
    }

    const orm = await MikroORM.init<PostgreSqlDriver>(config)
    const em = orm.em.fork()

    try {
        const user = await em.findOne(User, { email })
        if (!user) {
            console.error(`Usuario con email ${email} no encontrado.`)
            process.exit(1)
        }

        const minorista = await em.findOne(Minorista, { user })
        if (!minorista) {
            console.error(`El usuario ${email} no es un minorista.`)
            process.exit(1)
        }

        let dateStart: Date | undefined
        let dateEnd: Date | undefined
        let dateFilterMsg = 'HISTÓRICO COMPLETO'

        if (dateStr) {
            // Parse DD-MM-YYYY
            const parts = dateStr.split('-')
            if (parts.length !== 3) {
                console.error('Formato de fecha inválido. Usar DD-MM-YYYY (ej: 12-12-2025)')
                process.exit(1)
            }
            const day = parseInt(parts[0], 10)
            const month = parseInt(parts[1], 10) - 1 // JS months 0-11
            const year = parseInt(parts[2], 10)

            // Create date in local time then shift to Colombia (UTC-5) logic manually to be safe
            // Or simply: Create a date object at 00:00:00 and 23:59:59 considering offset.
            // Easiest is to construct the ISO string with offset -05:00

            const pad = (n: number) => n.toString().padStart(2, '0')

            // "2025-12-12T00:00:00-05:00"
            const isoStart = `${year}-${pad(month + 1)}-${pad(day)}T00:00:00-05:00`
            const isoEnd = `${year}-${pad(month + 1)}-${pad(day)}T23:59:59.999-05:00`

            dateStart = new Date(isoStart)
            dateEnd = new Date(isoEnd)

            if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
                console.error('Fecha inválida.')
                process.exit(1)
            }

            dateFilterMsg = `FILTRADO POR FECHA: ${dateStr} (Colombia Time)`
        }

        console.log(`--- Auditoría para Minorista: ${user.fullName} (${email}) ---`)
        console.log(`ID Minorista: ${minorista.id}`)
        console.log(dateFilterMsg)

        // 1. Calculate Initial Balance if date filter is active
        let initialBalance = 0
        if (dateStart) {
            const prevTransactions = await em.find(
                MinoristaTransaction,
                {
                    minorista: minorista.id,
                    createdAt: { $lt: dateStart },
                    status: MinoristaTransactionStatus.COMPLETED
                },
                { fields: ['type', 'amount', 'profitEarned'] }
            )

            for (const tx of prevTransactions) {
                let impact = 0
                switch (tx.type) {
                    case MinoristaTransactionType.DISCOUNT:
                        impact = -Number(tx.amount)
                        break
                    case MinoristaTransactionType.RECHARGE:
                    case MinoristaTransactionType.REFUND:
                    case MinoristaTransactionType.ADJUSTMENT:
                        impact = Number(tx.amount)
                        break
                }
                initialBalance += impact
            }

            console.log(`\nSaldo Anterior (Antes de ${dateStr}): $${initialBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
            if (initialBalance < 0) console.log(`(Es decir, comenzó el día con DEUDA de $${Math.abs(initialBalance).toLocaleString('es-VE', { minimumFractionDigits: 2 })})`)
            else console.log(`(Es decir, comenzó el día con SALDO A FAVOR)`)
        }

        // Build Query for Current Period
        const where: FilterQuery<MinoristaTransaction> = {
            minorista: minorista.id
        }

        if (dateStart && dateEnd) {
            where.createdAt = {
                $gte: dateStart,
                $lte: dateEnd
            }
        }

        const transactions = await em.find(
            MinoristaTransaction,
            where,
            { orderBy: { createdAt: 'ASC' } }
        )

        let totalGiros = 0
        let totalGanancia = 0
        let totalAbonos = 0
        let totalReembolsos = 0
        let periodBalance = 0

        console.log('\n--- Detalle de Transacciones (COMPLETED) ---')
        console.log('Fecha (COL)      | Tipo       | Monto      | Impacto    | Ganancia | Descripción')

        for (const tx of transactions) {
            if (tx.status !== MinoristaTransactionStatus.COMPLETED) {
                // Ignorar transacciones NO completadas (PENDING, CANCELLED)
                continue
            }

            let impact = 0

            switch (tx.type) {
                case MinoristaTransactionType.DISCOUNT:
                    totalGiros += Number(tx.amount)
                    totalGanancia += Number(tx.profitEarned || 0)
                    impact = -Number(tx.amount) // Resta saldo
                    break

                case MinoristaTransactionType.RECHARGE: // Abonos
                    totalAbonos += Number(tx.amount)
                    impact = Number(tx.amount) // Suma saldo
                    break

                case MinoristaTransactionType.REFUND:
                    totalReembolsos += Number(tx.amount)
                    impact = Number(tx.amount) // Suma saldo (Devuelve el dinero)
                    break

                case MinoristaTransactionType.ADJUSTMENT:
                    impact = Number(tx.amount)
                    break
            }

            periodBalance += impact

            // Format date to Colombia Time for display
            const colDate = new Intl.DateTimeFormat('es-CO', {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }).format(tx.createdAt)

            console.log(
                `${colDate} | ` +
                `${tx.type.padEnd(10)} | ` +
                `${Number(tx.amount).toFixed(2).padStart(10)} | ` +
                `${impact > 0 ? '+' : ''}${impact.toFixed(2).padStart(10)} | ` +
                `${(tx.profitEarned || 0).toFixed(2).padStart(8)} | ` +
                `${tx.description || ''}`
            )
        }

        console.log('\n--- Resumen General ---')
        if (dateStart) console.log(`Saldo Inicial (${dateStr}):      $${initialBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
        console.log(`Total Giros (DISCOUNT):       $${totalGiros.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
        console.log(`Total Ganancia (Profit):      $${totalGanancia.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
        console.log(`Total Abonos (RECHARGE):       $${totalAbonos.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
        console.log(`Total Reembolsos (REFUND):     $${totalReembolsos.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)

        console.log('\n--- Balance del Periodo Seleccionado ---')
        console.log(`Movimiento Neto del Día:       $${periodBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)

        const finalBalance = initialBalance + periodBalance

        console.log(`\n--- SALDO FINAL (Inicial + Movimiento) ---`)
        console.log(`Saldo Calculado:               $${finalBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)

        if (finalBalance >= 0) {
            console.log(`RESULTADO FINAL: SALDO A FAVOR de $${finalBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
        } else {
            console.log(`RESULTADO FINAL: DEUDA de $${Math.abs(finalBalance).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
        }
    } catch (error) {
        console.error('Error durante la auditoría:', error)
    } finally {
        await orm.close()
    }
}

auditMinorista()

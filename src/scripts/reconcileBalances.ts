import 'dotenv/config'
import { MikroORM } from '@mikro-orm/core'
import { Minorista } from '../entities/Minorista'
import { User, UserRole } from '../entities/User'
import {
  MinoristaTransaction,
  MinoristaTransactionStatus,
  MinoristaTransactionType,
} from '../entities/MinoristaTransaction'
import config from '../mikro-orm.config'
import { logger } from '../lib/logger'

async function reconcileBalances() {
  const orm = await MikroORM.init(config)
  const em = orm.em.fork()

  try {
    logger.info('🔍 Buscando minoristas con inconsistencias (Deuda + Saldo a Favor)...')

    const minoristas = await em.find(Minorista, {}, { populate: ['user'] })
    let fixedCount = 0

    // Find an admin user for the transaction log
    const adminUser = await em.findOne(User, { role: UserRole.SUPER_ADMIN })
    if (!adminUser) {
      logger.warn('⚠ No se encontró SUPER_ADMIN. Usando el primer usuario encontrado como fallback (solo auditoría).')
    }

    for (const m of minoristas) {
      // Deuda = Límite - Disponible
      const debt = m.creditLimit - m.availableCredit
      const balanceInFavor = m.creditBalance

      // Check threshold (avoid floating point noise)
      if (debt > 1 && balanceInFavor > 1) {
        logger.info(`\n⚠ Encontrado: ${m.user.fullName} (${m.user.email})`)
        logger.info(`   - Deuda actual: $${debt.toLocaleString()}`)
        logger.info(`   - Saldo a favor: $${balanceInFavor.toLocaleString()}`)

        const amountToReconcile = Math.min(debt, balanceInFavor)
        logger.info(`   🛠 Ajustando: Cruzando $${amountToReconcile.toLocaleString()}...`)

        // Capture previous state
        const prevAvailable = m.availableCredit
        const prevBalance = m.creditBalance

        // Update Minorista
        m.availableCredit += amountToReconcile
        m.creditBalance -= amountToReconcile

        // Helper to ensure user is never null
        const auditUser = adminUser || m.user
        // Use getReference to avoid strict Type issues with Loaded<User> vs User
        const auditUserRef = em.getReference(User, auditUser.id)

        // Create Transaction
        const transaction = em.create(MinoristaTransaction, {
          status: MinoristaTransactionStatus.COMPLETED,
          minorista: m,
          type: MinoristaTransactionType.ADJUSTMENT,
          amount: 0,
          description: 'Corrección automática: Cruce de Saldo a Favor contra Deuda',
          previousAvailableCredit: prevAvailable,
          previousBalanceInFavor: prevBalance,
          availableCredit: m.availableCredit,
          currentBalanceInFavor: m.creditBalance,
          createdBy: auditUserRef,
          createdAt: new Date(),
          accumulatedDebt: Math.max(0, m.creditLimit - m.availableCredit),
          balanceInFavorUsed: amountToReconcile,
          // Initialize other nullable fields
          accumulatedProfit: 0,
        })

        fixedCount++
        logger.info(
          `   ✅ Corregido. Deuda restante: $${Math.max(0, m.creditLimit - m.availableCredit).toLocaleString()} | Saldo restante: $${m.creditBalance.toLocaleString()}`
        )
      }
    }

    if (fixedCount > 0) {
      logger.info(`\n💾 Guardando cambios en ${fixedCount} minoristas...`)
      await em.flush()
      logger.info('✨ Todo listo.')
    } else {
      logger.info('\n👍 No se encontraron inconsistencias.')
    }
  } catch (error) {
    logger.error({ error }, '❌ Error')
  } finally {
    await orm.close()
  }
}

reconcileBalances()

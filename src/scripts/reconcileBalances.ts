import 'dotenv/config'
import { MikroORM } from '@mikro-orm/core'
import { Minorista } from '../entities/Minorista'
import { User, UserRole } from '../entities/User'
import { MinoristaTransaction, MinoristaTransactionType } from '../entities/MinoristaTransaction'
import config from '../mikro-orm.config'

async function reconcileBalances() {
  const orm = await MikroORM.init(config)
  const em = orm.em.fork()

  try {
    console.log('🔍 Buscando minoristas con inconsistencias (Deuda + Saldo a Favor)...')

    const minoristas = await em.find(Minorista, {}, { populate: ['user'] })
    let fixedCount = 0

    // Find an admin user for the transaction log
    const adminUser = await em.findOne(User, { role: UserRole.SUPER_ADMIN })
    if (!adminUser) {
      console.warn('⚠ No se encontró SUPER_ADMIN. Usando el primer usuario encontrado como fallback (solo auditoría).')
    }

    for (const m of minoristas) {
      // Deuda = Límite - Disponible
      const debt = m.creditLimit - m.availableCredit
      const balanceInFavor = m.creditBalance

      // Check threshold (avoid floating point noise)
      if (debt > 1 && balanceInFavor > 1) {
        console.log(`\n⚠ Encontrado: ${m.user.fullName} (${m.user.email})`)
        console.log(`   - Deuda actual: $${debt.toLocaleString()}`)
        console.log(`   - Saldo a favor: $${balanceInFavor.toLocaleString()}`)

        const amountToReconcile = Math.min(debt, balanceInFavor)
        console.log(`   🛠 Ajustando: Cruzando $${amountToReconcile.toLocaleString()}...`)

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
        console.log(
          `   ✅ Corregido. Deuda restante: $${Math.max(0, m.creditLimit - m.availableCredit).toLocaleString()} | Saldo restante: $${m.creditBalance.toLocaleString()}`
        )
      }
    }

    if (fixedCount > 0) {
      console.log(`\n💾 Guardando cambios en ${fixedCount} minoristas...`)
      await em.flush()
      console.log('✨ Todo listo.')
    } else {
      console.log('\n👍 No se encontraron inconsistencias.')
    }
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await orm.close()
  }
}

reconcileBalances()

import { initDI, DI } from '@/di'
import { Minorista } from '@/entities/Minorista'
import { User } from '@/entities/User'

async function applyAuditFix() {
  await initDI()
  const em = DI.orm.em.fork()

  const email = 'nathalypea@gmail.com'
  const user = await em.findOne(User, { email }, { populate: ['minorista'] })

  if (!user || !user.minorista) {
    console.log('User not found')
    return
  }

  const minorista = user.minorista
  console.log(`Before Update: Avail=${minorista.availableCredit}, Surplus=${minorista.creditBalance}`)

  // Values from Audit Calculation
  // Calculated Available: 98238
  // Calculated Surplus: 0

  minorista.availableCredit = 98238
  minorista.creditBalance = 0

  await em.flush()

  console.log(`After Update: Avail=${minorista.availableCredit}, Surplus=${minorista.creditBalance}`)
  console.log('Balance synchronized with Audit.')

  await DI.orm.close()
}

applyAuditFix()

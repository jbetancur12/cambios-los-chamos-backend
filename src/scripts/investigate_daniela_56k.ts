import 'dotenv/config'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import config from '../mikro-orm.config'
import { DI } from '../di'
import { User } from '../entities/User'
import { MinoristaTransaction } from '../entities/MinoristaTransaction'
import { Giro } from '../entities/Giro'

async function main() {
  const orm = await MikroORM.init<PostgreSqlDriver>(config)
  DI.orm = orm
  DI.em = orm.em.fork()

  const email = 'vasquezdaniela1902@gmail.com'
  const userRepo = DI.em.getRepository(User)
  const user = await userRepo.findOne({ email }, { populate: ['minorista'] })

  if (!user || !user.minorista) {
    console.log('User or Minorista profile not found')
    await orm.close()
    return
  }

  const minoristaId = user.minorista.id
  console.log(`Found Minorista: ${minoristaId} for ${email}`)

  // Search for transaction around Dec 16th with amount 56000
  // Dec 16th 2025? Or 2024? Current date is 2025-12-19. So likely Dec 16 2025.
  const targetDateStart = new Date('2025-12-16T00:00:00')
  const targetDateEnd = new Date('2025-12-16T23:59:59')

  const txRepo = DI.em.getRepository(MinoristaTransaction)
  const transactions = await txRepo.find(
    {
      minorista: minoristaId,
      // amount: 56000, // Look for exact amount, or close to it? User said 56000.
      createdAt: { $gte: targetDateStart, $lte: targetDateEnd },
    },
    {
      populate: ['giro'],
    }
  )

  console.log(`Found ${transactions.length} transactions on Dec 16th.`)

  for (const t of transactions) {
    if (Math.abs(t.amount - 56000) < 1 || Math.abs(t.amount - -56000) < 1) {
      console.log('--------------------------------------------------')
      console.log('MATCH FOUND:')
      console.log(`ID: ${t.id}`)
      console.log(`Type: ${t.type}`)
      console.log(`Amount: ${t.amount}`)
      console.log(`Description: ${t.description}`)
      console.log(`Created At: ${t.createdAt}`)
      console.log(`Giro ID linked: ${t.giro ? t.giro.id : 'NONE'}`)

      if (t.giro) {
        console.log(`Giro Beneficiary: ${t.giro.beneficiaryName}`)
        console.log(`Giro Status: ${t.giro.status}`)
      } else {
        console.log(' This transaction is NOT linked to any Giro.')
        // If description mentions "Giro", we have an orphan or manual entry.
      }
    }
  }

  await orm.close()
}

main().catch(console.error)

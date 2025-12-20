import 'dotenv/config'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import config from '../mikro-orm.config'
import { DI } from '../di'
import { Giro, GiroStatus } from '../entities/Giro'

async function main() {
  const orm = await MikroORM.init<PostgreSqlDriver>(config)
  DI.orm = orm
  DI.em = orm.em.fork()

  const giroId = 'a8441151-bb13-42f4-af81-90ac7e5a6009'
  const giroRepo = DI.em.getRepository(Giro)

  const giro = await giroRepo.findOne({ id: giroId })

  if (!giro) {
    console.log(`Giro ${giroId} not found`)
    await orm.close()
    return
  }

  console.log(`Current Status: ${giro.status}`)
  console.log(`Amount: ${giro.amountInput}`)
  console.log(`Beneficiary: ${giro.beneficiaryName}`)

  // Update to COMPLETED
  giro.status = GiroStatus.COMPLETADO
  // Optional: Set completedAt if null
  if (!giro.completedAt) {
    giro.completedAt = new Date('2025-12-16T08:18:12') // Match transaction time approx
  }

  await DI.em.flush()
  console.log(`Updated Giro ${giroId} status to COMPLETADO`)

  await orm.close()
}

main().catch(console.error)

import { initDI, DI } from '../di'
import { Bank } from '../entities/Bank'

async function run() {
  try {
    await initDI()
    const em = DI.orm.em.fork()
    const bank = await em.findOne(Bank, { name: 'BANESCO' })
    if (bank) {
      console.log(`BANK_ID:${bank.id}`)
    } else {
      console.error('Bank not found')
    }
  } catch (error) {
    console.error(error)
  } finally {
    await DI.orm.close()
  }
}

run()

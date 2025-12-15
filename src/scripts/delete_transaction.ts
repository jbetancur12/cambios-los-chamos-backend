import { initDI, DI } from '@/di'
import { MinoristaTransaction } from '@/entities/MinoristaTransaction'

async function deleteTransaction() {
  await initDI()
  const em = DI.orm.em.fork()

  // Replace this ID with the one you want to delete
  const txId = 'e591e043-d40f-44ad-99b8-e76358bf5d1a'

  try {
    const tx = await em.findOne(MinoristaTransaction, { id: txId })

    if (!tx) {
      console.log(`Transaction ${txId} not found.`)
      return
    }

    console.log(`Deleting Transaction: ${tx.id} | Type: ${tx.type} | Amount: ${tx.amount}`)

    await em.removeAndFlush(tx)
    console.log('Transaction deleted successfully.')
  } catch (error) {
    console.error('Error deleting transaction:', error)
  } finally {
    await DI.orm.close()
  }
}

deleteTransaction()

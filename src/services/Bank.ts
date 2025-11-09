import { DI } from '@/di'
import { Bank } from '@/entities/Bank'

class BankService {
  async getAllBanks(): Promise<Bank[]> {
    const bankRepo = DI.em.getRepository(Bank)
    return await bankRepo.findAll()
  }
}

export const bankService = new BankService()

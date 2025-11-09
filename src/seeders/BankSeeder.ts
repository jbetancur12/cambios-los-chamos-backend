import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { Bank, Currency } from '@/entities/Bank'

export class BankSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const banks = [
      { code: 102, name: 'BANCO DE VENEZUELA', currency: Currency.VES },
      { code: 104, name: 'BANCO VENEZOLANO DE CREDITO', currency: Currency.VES },
      { code: 105, name: 'BANCO MERCANTIL', currency: Currency.VES },
      { code: 108, name: 'BBVA PROVINCIAL', currency: Currency.VES },
      { code: 114, name: 'BANCARIBE', currency: Currency.VES },
      { code: 115, name: 'BANCO EXTERIOR', currency: Currency.VES },
      { code: 128, name: 'BANCO CARONI', currency: Currency.VES },
      { code: 134, name: 'BANESCO', currency: Currency.VES },
      { code: 137, name: 'BANCO SOFITASA', currency: Currency.VES },
      { code: 138, name: 'BANCO PLAZA', currency: Currency.VES },
      { code: 146, name: 'BANGENTE', currency: Currency.VES },
      { code: 151, name: 'BANCO FONDO COMUN', currency: Currency.VES },
      { code: 156, name: '100% BANCO', currency: Currency.VES },
      { code: 157, name: 'DELSUR BANCO UNIVERSAL', currency: Currency.VES },
      { code: 163, name: 'BANCO DEL TESORO', currency: Currency.VES },
      { code: 168, name: 'BANCRECER', currency: Currency.VES },
      { code: 169, name: 'R4 BANCO MICROFINANCIERO C.A.', currency: Currency.VES },
      { code: 171, name: 'BANCO ACTIVO', currency: Currency.VES },
      { code: 172, name: 'BANCAMIGA BANCO UNIVERSAL, C.A.', currency: Currency.VES },
      { code: 173, name: 'BANCO INTERNACIONAL DE DESARROLLO', currency: Currency.VES },
      { code: 174, name: 'BANPLUS', currency: Currency.VES },
      { code: 175, name: 'BANCO DIGITAL DE LOS TRABAJADORES, BANCO UNIVERSAL', currency: Currency.VES },
      { code: 177, name: 'BANFANB', currency: Currency.VES },
      { code: 178, name: 'N58 BANCO DIGITAL BANCO MICROFINANCIERO S A', currency: Currency.VES },
      { code: 191, name: 'BANCO NACIONAL DE CREDITO', currency: Currency.VES },
    ]

    for (const bankData of banks) {
      // Verificar si el banco ya existe por código
      const existingBank = await em.findOne(Bank, { code: bankData.code })

      if (!existingBank) {
        const bank = em.create(Bank, bankData)
        em.persist(bank)
      }
    }

    await em.flush()
  }
}

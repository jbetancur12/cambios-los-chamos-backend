import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { BankSeeder } from './BankSeeder'
import { ExchangeRateSeeder } from './ExchangeRateSeeder'
import { RechargeSeeder } from './RechargeSeeder'
import { RealMinoristasSeeder } from './RealMinoristaSeeder'
import { RealAdminsSeeder } from './RealAdminsSeeder'
import { RealTransferencistasSeeder } from './RealTransferencistasSeeder'
import { RealTransferencistaBankAccountsSeeder } from './RealTransferencistaBankAccountsSeeder'

export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    // return this.call(em, [BankSeeder, UserSeeder, ExchangeRateSeeder, RechargeSeeder])
    return this.call(em, [
      BankSeeder,
      RealMinoristasSeeder,
      RealAdminsSeeder,
      RealTransferencistasSeeder,
      RealTransferencistaBankAccountsSeeder,
      RechargeSeeder,
      ExchangeRateSeeder,
    ])
  }
}

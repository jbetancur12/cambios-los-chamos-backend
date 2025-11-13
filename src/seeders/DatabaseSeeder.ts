import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { BankSeeder } from './BankSeeder'
import { UserSeeder } from './UserSeeder'
import { ExchangeRateSeeder } from './ExchangeRateSeeder'

export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    return this.call(em, [BankSeeder, UserSeeder, ExchangeRateSeeder])
  }
}

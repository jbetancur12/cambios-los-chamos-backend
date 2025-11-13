import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { ExchangeRate } from '@/entities/ExchangeRate'
import { User, UserRole } from '@/entities/User'

export class ExchangeRateSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    // Buscar un usuario con rol SUPER_ADMIN o ADMIN
    let superAdmin = await em.findOne(User, { role: UserRole.SUPER_ADMIN })

    // Si no existe, buscar un ADMIN
    if (!superAdmin) {
      superAdmin = await em.findOne(User, { role: UserRole.ADMIN })
    }

    // Si aún no existe, lanzamos un error o lo omitimos
    if (!superAdmin) {
      throw new Error('No se encontró un usuario con rol SUPER_ADMIN o ADMIN para asignar como creador.')
    }

    // Crear la tasa de cambio
    const exchangeRate = em.create(ExchangeRate, {
      buyRate: 12.47,
      sellRate: 13.90,
      usd: 232,
      bcv: 226.13,
      createdBy: superAdmin,
      createdAt: new Date(),
      isCustom: false
    })

    await em.persistAndFlush(exchangeRate)
  }
}

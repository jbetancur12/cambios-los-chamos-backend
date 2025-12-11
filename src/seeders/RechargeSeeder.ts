import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { RechargeOperator } from '@/entities/RechargeOperator'
import { RechargeAmount } from '@/entities/RechargeAmount'
import { OperatorAmount } from '@/entities/OperatorAmount'
import { User } from '@/entities/User'
import { SUPERADMIN_EMAIL } from '@/settings'

// Datos de operadores y sus montos basados en las imágenes (Telecel eliminado)
const operatorsConfig = {
  // Movilnet
  Movilnet: [150, 300, 400, 600, 900, 1500, 3900, 6600],
  // Movistar
  Movistar: [100, 200, 500, 800, 1500, 1800, 3000, 5000],
  // Digitel
  Digitel: [160, 320, 960, 1280, 1440, 2400, 3800, 4800, 5440],
}

export class RechargeSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const superadmin = await em.findOne(User, { email: SUPERADMIN_EMAIL })
    if (!superadmin) {
      console.warn('Superadmin not found, cannot seed recharge data')
      return
    }

    // Paso 1: Crear Recharge Operators
    const operatorsData = [
      { name: 'Movilnet', code: 416, type: 'MOVIL' },
      { name: 'Movistar', code: 414, type: 'MOVIL' },
      { name: 'Digitel', code: 412, type: 'MOVIL' },
    ]
    const operators: Record<string, RechargeOperator> = {}

    for (const operatorData of operatorsData) {
      let operator = await em.findOne(RechargeOperator, { name: operatorData.name })

      if (!operator) {
        operator = em.create(RechargeOperator, {
          name: operatorData.name,
          code: operatorData.code,
          type: operatorData.type,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        em.persist(operator)
      }
      operators[operatorData.name] = operator
    }
    await em.flush()

    // --- Montos de las imágenes ---
    // 1. Recolectar todos los montos únicos de todos los operadores
    const allUniqueAmounts = new Set<number>()
    Object.values(operatorsConfig).forEach((amounts) => {
      amounts.forEach((amount) => allUniqueAmounts.add(amount))
    })
    const amountsData = Array.from(allUniqueAmounts).sort((a, b) => a - b)
    // -----------------------------

    // Paso 2: Crear Recharge Amounts (en Bolívares - VES)
    const amountsMap = new Map<number, RechargeAmount>()
    const amounts: RechargeAmount[] = []

    for (const amountBs of amountsData) {
      let amount = await em.findOne(RechargeAmount, { amountBs })

      if (!amount) {
        amount = em.create(RechargeAmount, {
          amountBs,
          isActive: true,
          createdBy: superadmin,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        em.persist(amount)
      }
      amounts.push(amount)
      amountsMap.set(amountBs, amount)
    }
    await em.flush()

    // Paso 3: Crear relaciones específicas Operator-Amount
    let createdRelationships = 0

    for (const [operatorName, applicableAmounts] of Object.entries(operatorsConfig)) {
      const operator = operators[operatorName]

      if (!operator) continue

      for (const amountBs of applicableAmounts) {
        const amount = amountsMap.get(amountBs)

        if (!amount) continue

        // Verificar si la relación ya existe
        const existingRelation = await em.findOne(OperatorAmount, {
          operator,
          amount,
        })

        if (!existingRelation) {
          const relation = em.create(OperatorAmount, {
            operator,
            amount,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })

          em.persist(relation)
          createdRelationships++
        }
      }
    }

    await em.flush()

    console.log('✅ Recharge operators and amounts seeded successfully based on images')
    console.log(`   - Creados ${Object.keys(operators).length} operadores`)
    console.log(`   - Creados ${amounts.length} montos de recarga únicos`)
    console.log(`   - Creadas ${createdRelationships} relaciones operador-monto`)
  }
}

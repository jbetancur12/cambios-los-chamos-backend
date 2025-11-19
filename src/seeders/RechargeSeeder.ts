import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { RechargeOperator } from '@/entities/RechargeOperator'
import { RechargeAmount } from '@/entities/RechargeAmount'
import { OperatorAmount } from '@/entities/OperatorAmount'
import { User } from '@/entities/User'
import { SUPERADMIN_EMAIL } from '@/settings'

export class RechargeSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    // Get superadmin to use as createdBy
    const superadmin = await em.findOne(User, { email: SUPERADMIN_EMAIL })
    if (!superadmin) {
      console.warn('Superadmin not found, cannot seed recharge data')
      return
    }

    // Step 1: Create Recharge Operators
    const operatorsData = [
      { name: 'Movistar', type: 'MOVIL' },
      { name: 'Digitel', type: 'MOVIL' },
      { name: 'Movilnet', type: 'MOVIL' },
      { name: 'Telecel', type: 'MOVIL' },
    ]

    const operators: Record<string, RechargeOperator> = {}

    for (const operatorData of operatorsData) {
      const existingOperator = await em.findOne(RechargeOperator, {
        name: operatorData.name,
      })

      if (!existingOperator) {
        const operator = em.create(RechargeOperator, {
          name: operatorData.name,
          type: operatorData.type,
          isActive: true,
        })
        em.persist(operator)
        operators[operatorData.name] = operator
      } else {
        operators[operatorData.name] = existingOperator
      }
    }

    await em.flush()

    // Step 2: Create Recharge Amounts
    const amountsData = [
      5000, 10000, 20000, 50000, 100000, 200000, 500000,
    ]

    const amounts: RechargeAmount[] = []

    for (const amountBs of amountsData) {
      const existingAmount = await em.findOne(RechargeAmount, {
        amountBs,
      })

      if (!existingAmount) {
        const amount = em.create(RechargeAmount, {
          amountBs,
          isActive: true,
          createdBy: superadmin,
        })
        em.persist(amount)
        amounts.push(amount)
      } else {
        amounts.push(existingAmount)
      }
    }

    await em.flush()

    // Step 3: Create Operator-Amount relationships
    // Each operator should have all amounts available
    for (const operatorName of Object.keys(operators)) {
      const operator = operators[operatorName]

      for (const amount of amounts) {
        // Check if relationship already exists
        const existingRelation = await em.findOne(OperatorAmount, {
          operator,
          amount,
        })

        if (!existingRelation) {
          const relation = em.create(OperatorAmount, {
            operator,
            amount,
            isActive: true,
          })
          em.persist(relation)
        }
      }
    }

    await em.flush()

    console.log('✅ Recharge operators and amounts seeded successfully')
    console.log(`   - Created ${Object.keys(operators).length} operators`)
    console.log(`   - Created ${amounts.length} recharge amounts`)
    console.log(
      `   - Created ${Object.keys(operators).length * amounts.length} operator-amount relationships`
    )
  }
}

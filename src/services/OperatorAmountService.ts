import { DI } from '@/di'
import { OperatorAmount } from '@/entities/OperatorAmount'

export class OperatorAmountService {
  /**
   * Obtiene todos los montos disponibles para un operador específico
   */
  async getAmountsByOperator(operatorId: string): Promise<OperatorAmount[]> {
    const amounts = await DI.operatorAmounts.find(
      { operator: { id: operatorId }, isActive: true },
      { populate: ['amount'] }
    )
    return amounts
  }

  /**
   * Obtiene una relación específica de operador-monto
   */
  async getOperatorAmount(
    operatorId: string,
    amountId: string
  ): Promise<OperatorAmount | null> {
    const operatorAmount = await DI.operatorAmounts.findOne(
      { operator: { id: operatorId }, amount: { id: amountId }, isActive: true },
      { populate: ['operator', 'amount'] }
    )
    return operatorAmount || null
  }

  /**
   * Crea una nueva relación operador-monto
   */
  async createOperatorAmount(
    operatorId: string,
    amountId: string
  ): Promise<OperatorAmount> {
    const operator = await DI.rechargeOperators.findOneOrFail(operatorId)
    const amount = await DI.rechargeAmounts.findOneOrFail(amountId)

    const operatorAmount = new OperatorAmount()
    operatorAmount.operator = operator
    operatorAmount.amount = amount
    operatorAmount.isActive = true

    await DI.em.persistAndFlush(operatorAmount)
    return operatorAmount
  }

  /**
   * Desactiva una relación operador-monto
   */
  async deactivateOperatorAmount(operatorAmountId: string): Promise<void> {
    const operatorAmount = await DI.operatorAmounts.findOneOrFail(operatorAmountId)
    operatorAmount.isActive = false
    await DI.em.persistAndFlush(operatorAmount)
  }

  /**
   * Obtiene todos los montos para un operador (incluyendo inactivos) - ADMIN
   */
  async getAllAmountsByOperator(operatorId: string): Promise<OperatorAmount[]> {
    const amounts = await DI.operatorAmounts.find(
      { operator: { id: operatorId } },
      { populate: ['amount'] }
    )
    return amounts
  }

  /**
   * Valida que una relación operador-monto exista y esté activa
   */
  async validateOperatorAmountRelation(
    operatorId: string,
    amountId: string
  ): Promise<boolean> {
    const operatorAmount = await DI.operatorAmounts.findOne({
      operator: { id: operatorId },
      amount: { id: amountId },
      isActive: true,
    })
    return operatorAmount !== null
  }
}

export const operatorAmountService = new OperatorAmountService()

import { DI } from '@/di'
import { BankAssignment } from '@/entities/BankAssignment'

export interface CreateBankAssignmentInput {
  bankId: string
  transferencistaId: string
  priority?: number
}

export class BankAssignmentService {
  /**
   * Crea una asignación de banco a transferencista
   */
  async createBankAssignment(
    data: CreateBankAssignmentInput
  ): Promise<BankAssignment | { error: 'BANK_NOT_FOUND' | 'TRANSFERENCISTA_NOT_FOUND' | 'ASSIGNMENT_ALREADY_EXISTS' }> {
    const bankAssignmentRepo = DI.em.getRepository(BankAssignment)

    // Verificar que existan banco y transferencista
    const bank = await DI.banks.findOne({ id: data.bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    const transferencista = await DI.transferencistas.findOne({ id: data.transferencistaId })
    if (!transferencista) {
      return { error: 'TRANSFERENCISTA_NOT_FOUND' }
    }

    // Verificar que no exista ya una asignación para este transferencista y banco
    const existingAssignment = await bankAssignmentRepo.findOne({
      bank: data.bankId,
      transferencista: data.transferencistaId,
    })

    if (existingAssignment) {
      return { error: 'ASSIGNMENT_ALREADY_EXISTS' }
    }

    // Crear asignación
    const bankAssignment = bankAssignmentRepo.create({
      bank,
      transferencista,
      isActive: true,
      priority: data.priority ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(bankAssignment)

    return bankAssignment
  }

  /**
   * Lista todas las asignaciones de bancos
   */
  async listBankAssignments(activeOnly = false): Promise<BankAssignment[]> {
    const bankAssignmentRepo = DI.em.getRepository(BankAssignment)

    const where = activeOnly ? { isActive: true } : {}

    const assignments = await bankAssignmentRepo.find(where, {
      populate: ['bank', 'transferencista', 'transferencista.user'],
      orderBy: { priority: 'DESC', createdAt: 'DESC' },
    })

    return assignments
  }

  /**
   * Obtiene asignaciones por banco
   */
  async getAssignmentsByBank(bankId: string): Promise<BankAssignment[] | { error: 'BANK_NOT_FOUND' }> {
    const bank = await DI.banks.findOne({ id: bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    const bankAssignmentRepo = DI.em.getRepository(BankAssignment)
    const assignments = await bankAssignmentRepo.find(
      { bank: bankId },
      {
        populate: ['bank', 'transferencista', 'transferencista.user'],
        orderBy: { priority: 'DESC' },
      }
    )

    return assignments
  }

  /**
   * Obtiene asignaciones por transferencista
   */
  async getAssignmentsByTransferencista(
    transferencistaId: string
  ): Promise<BankAssignment[] | { error: 'TRANSFERENCISTA_NOT_FOUND' }> {
    const transferencista = await DI.transferencistas.findOne({ id: transferencistaId })
    if (!transferencista) {
      return { error: 'TRANSFERENCISTA_NOT_FOUND' }
    }

    const bankAssignmentRepo = DI.em.getRepository(BankAssignment)
    const assignments = await bankAssignmentRepo.find(
      { transferencista: transferencistaId },
      {
        populate: ['bank', 'transferencista', 'transferencista.user'],
        orderBy: { priority: 'DESC' },
      }
    )

    return assignments
  }

  /**
   * Actualiza la prioridad de una asignación
   */
  async updatePriority(
    assignmentId: string,
    priority: number
  ): Promise<BankAssignment | { error: 'ASSIGNMENT_NOT_FOUND' }> {
    const bankAssignmentRepo = DI.em.getRepository(BankAssignment)

    const assignment = await bankAssignmentRepo.findOne({ id: assignmentId })
    if (!assignment) {
      return { error: 'ASSIGNMENT_NOT_FOUND' }
    }

    assignment.priority = priority
    await DI.em.persistAndFlush(assignment)

    return assignment
  }

  /**
   * Activa o desactiva una asignación
   */
  async toggleActive(assignmentId: string): Promise<BankAssignment | { error: 'ASSIGNMENT_NOT_FOUND' }> {
    const bankAssignmentRepo = DI.em.getRepository(BankAssignment)

    const assignment = await bankAssignmentRepo.findOne({ id: assignmentId })
    if (!assignment) {
      return { error: 'ASSIGNMENT_NOT_FOUND' }
    }

    assignment.isActive = !assignment.isActive
    await DI.em.persistAndFlush(assignment)

    return assignment
  }

  /**
   * Elimina una asignación
   */
  async deleteAssignment(assignmentId: string): Promise<boolean | { error: 'ASSIGNMENT_NOT_FOUND' }> {
    const bankAssignmentRepo = DI.em.getRepository(BankAssignment)

    const assignment = await bankAssignmentRepo.findOne({ id: assignmentId })
    if (!assignment) {
      return { error: 'ASSIGNMENT_NOT_FOUND' }
    }

    await DI.em.removeAndFlush(assignment)

    return true
  }
}

export const bankAssignmentService = new BankAssignmentService()

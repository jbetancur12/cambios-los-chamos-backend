import { z } from 'zod'

export const createBankAssignmentSchema = z.object({
  bankId: z.string().uuid('ID de banco inválido'),
  transferencistaId: z.string().uuid('ID de transferencista inválido'),
  priority: z.number().int().min(0, 'La prioridad debe ser un número entero positivo').optional(),
})

export const updatePrioritySchema = z.object({
  priority: z.number().int().min(0, 'La prioridad debe ser un número entero positivo'),
})

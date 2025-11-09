import { z } from 'zod'
import { BankTransactionType } from '@/entities/BankTransaction'

export const createBankTransactionSchema = z.object({
  bankId: z.string().min(1, 'El ID del banco es requerido'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  type: z.nativeEnum(BankTransactionType, {
    message: 'Tipo de transacción inválido',
  }),
  description: z.string().optional(),
  reference: z.string().optional(),
})

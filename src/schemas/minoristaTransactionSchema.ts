import { z } from 'zod'
import { MinoristaTransactionType } from '@/entities/MinoristaTransaction'

export const createTransactionSchema = z.object({
  minoristaId: z.string().min(1, 'El ID del minorista es requerido'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  type: z.nativeEnum(MinoristaTransactionType, {
    message: 'Tipo de transacción inválido',
  }),
})

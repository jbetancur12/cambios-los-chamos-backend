// src/schemas/createTransferencistaSchema.ts
import { z } from 'zod'

export const createTransferencistaSchema = z.object({
  fullName: z.string().min(3, { message: 'Nombre completo mínimo 3 caracteres' }),
  email: z.string().email({ message: 'Email inválido' }),
  password: z.string().min(6, { message: 'La contraseña debe tener mínimo 6 caracteres' }),
  available: z.boolean().optional(),
})

export type CreateTransferencistaInput = z.infer<typeof createTransferencistaSchema>

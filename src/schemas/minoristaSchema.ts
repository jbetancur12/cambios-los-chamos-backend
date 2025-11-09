import { z } from 'zod'

export const createMinoristaSchema = z.object({
  fullName: z.string().min(1, 'El nombre completo es requerido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  balance: z.number().min(0, 'El balance debe ser mayor o igual a 0').optional(),
})

export const updateMinoristaBalanceSchema = z.object({
  balance: z.number().min(0, 'El balance debe ser mayor o igual a 0'),
})

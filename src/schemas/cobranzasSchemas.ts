import { z } from 'zod'

export const createCobranzaClientSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  identification: z.string().min(1, 'Cédula/RIF es requerido'),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

export const updateCobranzaClientSchema = createCobranzaClientSchema.partial()

export const createCreditSchema = z.object({
  clientId: z.string().uuid('Cliente inválido'),
  amount: z.coerce.number().min(1, 'Monto inválido'),
  interestRate: z.coerce.number().min(0, 'Interés inválido').max(1000),
  totalInstallments: z.coerce.number().int().min(1, 'Mínimo 1 cuota').max(366),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
  loanDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .optional(),
  description: z.string().optional(),
})

export const updateCreditSchema = createCreditSchema.partial()

export const followUpSchema = z.object({
  note: z.string().min(1, 'Nota requerida'),
})

export const registerPaymentSchema = z.object({
  creditId: z.string().uuid('Crédito inválido'),
  amount: z.coerce.number().min(0.01, 'Monto inválido'),
  paymentMethod: z.enum(['cash', 'transfer', 'mobile_payment']),
  paymentDate: z.string().optional(),
})

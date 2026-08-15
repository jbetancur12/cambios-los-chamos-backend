import { z } from 'zod'

export const createCobranzaClientSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  identification: z.string().min(1, 'Cédula/RIF es requerido'),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  categoryId: z.string().uuid('Categoría inválida').optional().nullable(),
  creditLimitOverride: z.coerce.number().min(0, 'Límite inválido').optional().nullable(),
  maxCreditsOverride: z.coerce.number().int().min(0).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  notes: z.string().optional(),
})

export const updateCobranzaClientSchema = createCobranzaClientSchema.partial()

export const createClientCategorySchema = z.object({
  code: z.string().min(1, 'Código es requerido'),
  name: z.string().min(1, 'Nombre es requerido'),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  minOverdueCount: z.coerce.number().int().min(0).optional().nullable(),
  maxOverdueCount: z.coerce.number().int().min(0).optional().nullable(),
  maxAmount: z.coerce.number().min(0).optional().nullable(),
  minAmount: z.coerce.number().min(0).optional(),
  maxCredits: z.coerce.number().int().min(0).optional().nullable(),
})

export const updateClientCategorySchema = createClientCategorySchema.partial()

export const createInterestRateSchema = z.object({
  name: z.string().optional(),
  rate: z.coerce.number().min(0, 'Tasa inválida').max(100, 'Tasa máxima 100%'),
  isActive: z.boolean().optional(),
})

export const updateInterestRateSchema = createInterestRateSchema.partial()

export const updateLoanFrequencySchema = z.object({
  name: z.string().min(1, 'Nombre requerido').optional(),
  description: z.string().optional(),
  isEnabled: z.boolean().optional(),
  isFixedDuration: z.boolean().optional(),
  fixedInstallments: z.coerce.number().int().min(1).optional().nullable(),
  fixedDurationDays: z.coerce.number().int().min(1).optional().nullable(),
  periodDays: z.coerce.number().int().min(1).optional(),
  defaultInstallments: z.coerce.number().int().min(1).optional().nullable(),
  minInstallments: z.coerce.number().int().min(1).optional().nullable(),
  maxInstallments: z.coerce.number().int().min(1).optional().nullable(),
  interestRate: z.coerce.number().min(0).max(100).optional().nullable(),
})

export const createLoanFrequencySchema = z.object({
  code: z.string().min(1, 'Código requerido'),
  name: z.string().min(1, 'Nombre requerido'),
  description: z.string().optional(),
  isEnabled: z.boolean().optional(),
  isFixedDuration: z.boolean().optional(),
  fixedInstallments: z.coerce.number().int().min(1).optional().nullable(),
  fixedDurationDays: z.coerce.number().int().min(1).optional().nullable(),
  periodDays: z.coerce.number().int().min(1, 'Periodo requerido'),
  defaultInstallments: z.coerce.number().int().min(1).optional().nullable(),
  minInstallments: z.coerce.number().int().min(1).optional().nullable(),
  maxInstallments: z.coerce.number().int().min(1).optional().nullable(),
  interestRate: z.coerce.number().min(0).max(100).optional().nullable(),
})

export const createCobranzaRouteSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  description: z.string().optional(),
  cobradorId: z.string().uuid('Cobrador inválido'),
  clientIds: z.array(z.string().uuid()).optional(),
})

export const updateCobranzaRouteSchema = createCobranzaRouteSchema.partial()

export const assignClientsToRouteSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos un cliente'),
})

export const createCreditSchema = z.object({
  clientId: z.string().uuid('Cliente inválido'),
  cobradorId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().min(0.01, 'Monto inválido'),
  balance: z.coerce.number().min(0).optional(),
  frequency: z.string().min(1, 'Frecuencia inválida'),
  startDate: z.string().min(1, 'Fecha de inicio requerida'),
  endDate: z.string().optional(),
  status: z.enum(['pending_approval', 'waiting_delivery', 'active', 'paid_off', 'defaulted', 'cancelled']).optional(),
  scheduledDeliveryDate: z.string().optional().nullable(),
  immediateDeliveryRequested: z.boolean().optional(),
  interestRate: z.coerce.number().min(0).max(100).optional(),
  totalInstallments: z.coerce.number().int().min(1).optional().nullable(),
  description: z.string().optional(),
  downPayment: z.coerce.number().min(0).optional().nullable(),
  isCustomCredit: z.boolean().optional(),
  calcOnRemainingAmount: z.boolean().optional(),
  isLegacyCredit: z.boolean().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
})

export const updateCreditSchema = createCreditSchema.partial()

export const approveCreditSchema = z.object({
  scheduledDeliveryDate: z.string().min(1, 'Fecha de entrega requerida'),
  notes: z.string().optional(),
})

export const rejectCreditSchema = z.object({
  reason: z.string().min(1, 'Motivo del rechazo es requerido'),
})

export const deliverCreditSchema = z.object({
  notes: z.string().optional(),
  firstPaymentToday: z.boolean().optional(),
})

export const rescheduleCreditSchema = z.object({
  scheduledDeliveryDate: z.string().min(1, 'Nueva fecha requerida'),
  reason: z.string().optional(),
})

export const registerPaymentSchema = z.object({
  creditId: z.string().uuid('Crédito inválido'),
  amount: z.coerce.number().min(0.01, 'Monto inválido'),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'mobile_payment']),
  paymentType: z.enum(['regular', 'down_payment', 'extra']).optional(),
  paymentDate: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  transactionId: z.string().optional(),
  cashBalanceId: z.string().uuid().optional().nullable(),
})

export const openCashBalanceSchema = z.object({
  initialAmount: z.coerce.number().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
})

export const closeCashBalanceSchema = z.object({
  lentAmount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  requiresReconciliation: z.boolean().optional(),
})

import { Currency } from '@/entities/Bank'
import { z } from 'zod'

export const createGiroSchema = z.object({
  minoristaId: z.string().uuid('ID de minorista inválido').optional(),
  beneficiaryName: z.string().min(1, 'El nombre del beneficiario es requerido'),
  beneficiaryId: z.string().min(1, 'La identificación del beneficiario es requerida'),
  bankId: z.string().uuid('ID de banco inválido'),
  accountNumber: z.string().min(1, 'El número de cuenta es requerido'),
  phone: z.string().min(1, 'El teléfono es requerido'),
  amountInput: z.number().positive('La cantidad debe ser un número positivo'),
  currencyInput: z.enum([Currency.COP, Currency.USD, Currency.VES], 'La moneda de entrada es inválida'),
  rateAppliedId: z.string().uuid('ID de tasa inválido'),
  amountBs: z.number().positive('El monto en Bs debe ser un número positivo'),
})

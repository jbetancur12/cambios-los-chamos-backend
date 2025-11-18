import { Currency } from '@/entities/Bank'
import { z } from 'zod'

export const createGiroSchema = z.object({
  minoristaId: z.string().uuid('ID de minorista inválido').optional(),
  beneficiaryName: z.string().min(1, 'El nombre del beneficiario es requerido'),
  beneficiaryId: z.string().min(1, 'La identificación del beneficiario es requerida'),
  bankId: z.string().uuid('ID de banco inválido'),
  accountNumber: z.string().min(1, 'El número de cuenta es requerido'),
  phone: z.string().optional(),
  amountInput: z.number().positive('La cantidad debe ser un número positivo'),
  currencyInput: z.enum([Currency.COP, Currency.USD, Currency.VES], 'La moneda de entrada es inválida'),
  // Solo SUPER_ADMIN puede hacer override de la tasa pasando valores personalizados
  customRate: z
    .object({
      buyRate: z.number().positive('La tasa de compra debe ser mayor a 0'),
      sellRate: z.number().positive('La tasa de venta debe ser mayor a 0'),
      usd: z.number().positive('El valor USD debe ser mayor a 0'),
      bcv: z.number().positive('El valor BCV debe ser mayor a 0'),
    })
    .optional(),
  // amountBs se calcula en el backend basado en la tasa del día o customRate
})

export const updateGiroRateSchema = z.object({
  buyRate: z.number().positive('La tasa de compra debe ser mayor a 0'),
  sellRate: z.number().positive('La tasa de venta debe ser mayor a 0'),
  usd: z.number().positive('El valor USD debe ser mayor a 0'),
  bcv: z.number().positive('El valor BCV debe ser mayor a 0'),
})

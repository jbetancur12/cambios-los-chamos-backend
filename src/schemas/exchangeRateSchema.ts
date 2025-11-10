import { z } from 'zod'

export const createExchangeRateSchema = z.object({
  buyRate: z.number().positive('La tasa de compra debe ser mayor a 0'),
  sellRate: z.number().positive('La tasa de venta debe ser mayor a 0'),
  usd: z.number().positive('El valor USD debe ser mayor a 0'),
  bcv: z.number().positive('El valor BCV debe ser mayor a 0'),
})

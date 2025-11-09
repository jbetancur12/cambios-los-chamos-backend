import { z } from 'zod'

export const createExchangeRateSchema = z.object({
  copToBs: z.number().positive('La tasa COP a Bs debe ser mayor a 0'),
  usdToBs: z.number().positive('La tasa USD a Bs debe ser mayor a 0'),
  bcvValue: z.number().positive('El valor BCV debe ser mayor a 0'),
})

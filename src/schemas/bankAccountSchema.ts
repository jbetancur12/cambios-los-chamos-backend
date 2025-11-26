import { z } from 'zod'
import { AccountType, BankAccountOwnerType } from '@/entities/BankAccount'

export const createBankAccountSchema = z.object({
  bankId: z.string().uuid('ID de banco inválido'),
  accountHolder: z.string().min(1, 'El titular de la cuenta es requerido'),
  ownerType: z.nativeEnum(BankAccountOwnerType, { message: 'Tipo de propietario inválido' }),
  ownerId: z.string().uuid('ID de propietario inválido').optional(), // Solo para cuentas TRANSFERENCISTA
})

export const updateBankAccountBalanceSchema = z.object({
  bankAccountId: z.string().uuid({ message: 'bankAccountId inválido' }),
  amount: z.number().refine((val) => val !== 0, {
    message: 'El monto no puede ser cero (debe ser positivo para recargar o negativo para ajustar)',
  }),
})

export const listBankAccountsSchema = z.object({
  transferencistaId: z.string().uuid({ message: 'transferencistaId inválido' }),
})

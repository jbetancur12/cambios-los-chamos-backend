import { z } from 'zod'
import { AccountType } from '@/entities/BankAccount'

export const createBankAccountSchema = z.object({
  transferencistaId: z.string().uuid('ID de transferencista inválido').optional(), // Solo para admin/superadmin
  bankId: z.string().uuid('ID de banco inválido'),
  accountNumber: z.string().min(1, 'El número de cuenta es requerido'),
  accountHolder: z.string().min(1, 'El titular de la cuenta es requerido'),
  accountType: z.nativeEnum(AccountType, { message: 'Tipo de cuenta inválido' }).optional(),
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

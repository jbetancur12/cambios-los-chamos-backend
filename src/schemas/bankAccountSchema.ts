import { z } from 'zod'
import { AccountType } from '@/entities/BankAccount'

export const createBankAccountSchema = z.object({
  transferenciaId: z.string().uuid('ID de transferencista inválido').optional(), // Solo para admin/superadmin
  bankId: z.string().uuid('ID de banco inválido'),
  accountNumber: z.string().min(1, 'El número de cuenta es requerido'),
  accountHolder: z.string().min(1, 'El titular de la cuenta es requerido'),
  accountType: z.nativeEnum(AccountType, { message: 'Tipo de cuenta inválido' }).optional(),
  balance: z.number().min(0, 'El balance debe ser mayor o igual a 0').default(0),
})

export const updateBankAccountBalanceSchema = z.object({
  balance: z.number().min(0, 'El balance debe ser mayor o igual a 0'),
})

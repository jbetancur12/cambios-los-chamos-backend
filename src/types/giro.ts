import { Currency } from '@/entities/Bank'
import { ExchangeRate } from '@/entities/ExchangeRate'

export interface CreateGiroInput {
  rateApplied: ExchangeRate
  minoristaId?: string // Opcional: solo requerido cuando minorista crea el giro
  beneficiaryName: string
  beneficiaryId: string
  bankName: string
  accountNumber: string
  phone: string
  amountInput: number
  currencyInput: Currency
  amountBs: number
}

import { Currency } from '@/entities/Bank'
import { ExchangeRate } from '@/entities/ExchangeRate'
import { ExecutionType } from '@/entities/Giro'

export interface CreateGiroInput {
  rateApplied: ExchangeRate
  minoristaId?: string // Opcional: solo requerido cuando minorista crea el giro
  beneficiaryName: string
  beneficiaryId: string
  bankId: string // ID del banco destino para asignar transferencista
  accountNumber: string
  phone: string
  amountInput: number
  currencyInput: Currency
  amountBs: number
  executionType: ExecutionType
}

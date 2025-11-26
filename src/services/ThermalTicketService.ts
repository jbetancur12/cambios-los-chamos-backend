import { DI } from '@/di'
import { Giro } from '@/entities/Giro'

// Funciones de formato
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export interface ThermalTicketData {
  // Encabezado
  companyName: string
  companyPhone: string
  companyAddress: string
  companyCity: string
  divider: string

  // Info del giro
  giroId: string
  createdAt: string
  completedAt?: string

  // Beneficiario
  beneficiaryName: string
  beneficiaryId: string
  bankName: string
  accountNumber: string
  phone?: string

  // Montos
  amountInput: string
  currencyInput: string
  amountBs: string
  commission?: string
  bcvApplied: string

  // Ganancias
  systemProfit: string
  minoristaProfit: string

  // Tipo de ejecución
  executionType: string
  bankAccountUsed?: string

  // Creado por
  createdByName: string
  executedByName?: string

  // Footer
  timestamp: string
}

export class ThermalTicketService {
  /**
   * Genera los datos formateados para un tiquete térmico
   * Retorna objeto con todos los datos necesarios para renderizar el tiquete
   */
  async generateTicketData(giro: Giro): Promise<ThermalTicketData> {
    const createdByUser = giro.createdBy
    const executedByUser = giro.bankAccountUsed?.transferencista?.user

    // Obtener datos de la transacción bancaria si existe
    let bankAccountUsedFormatted = ''
    let commission = undefined
    if (giro.bankAccountUsed) {
      const bank = giro.bankAccountUsed.bank
      bankAccountUsedFormatted = `${bank.name}`
      // La comisión se envía en el request, aquí es un estimado
      commission = '0.00'
    }

    return {
      // Encabezado
      companyName: 'CAMBIOS LOS CHAMOS',
      companyPhone: '+57 302 341 4813', // Actualizar con número real
      companyAddress: 'Cra 21 # 43 - 26 Av, Molinos',
      companyCity: 'Dosquebradas, Risaralda',
      divider: '================================',

      // Info del giro
      giroId: giro.id,
      createdAt: formatDate(giro.createdAt),
      completedAt: giro.completedAt ? formatDate(giro.completedAt) : undefined,

      // Beneficiario
      beneficiaryName: giro.beneficiaryName,
      beneficiaryId: giro.beneficiaryId,
      bankName: giro.bankName,
      accountNumber: giro.accountNumber,
      phone: giro.phone,

      // Montos
      amountInput: `${formatCurrency(giro.amountInput)} ${giro.currencyInput}`,
      currencyInput: giro.currencyInput,
      amountBs: formatCurrency(giro.amountBs),
      commission,
      bcvApplied: formatCurrency(giro.rateApplied.bcv),

      // Ganancias
      systemProfit: formatCurrency(giro.systemProfit),
      minoristaProfit: giro.minoristaProfit ? formatCurrency(giro.minoristaProfit) : '0.00',

      // Tipo de ejecución
      executionType: giro.executionType ? giro.executionType.replace(/_/g, ' ') : 'DESCONOCIDO',
      bankAccountUsed: bankAccountUsedFormatted,

      // Creado por
      createdByName: createdByUser?.fullName || 'DESCONOCIDO',
      executedByName: executedByUser?.fullName,

      // Footer
      timestamp: formatDate(new Date()),
    }
  }

  /**
   * Obtiene un giro y genera sus datos de tiquete
   */
  async getTicketDataForGiro(giroId: string): Promise<ThermalTicketData> {
    const giro = await DI.giros.findOne(
      { id: giroId },
      {
        populate: [
          'createdBy',
          'bankAccountUsed',
          'bankAccountUsed.bank',
          'bankAccountUsed.transferencista',
          'bankAccountUsed.transferencista.user',
        ],
      }
    )

    if (!giro) {
      throw new Error(`Giro con ID ${giroId} no encontrado`)
    }

    return this.generateTicketData(giro)
  }
}

export const thermalTicketService = new ThermalTicketService()

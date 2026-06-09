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
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
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
    const executedByUser = giro.executedBy

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
          'executedBy',
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

  /**
   * Genera los datos formateados para un tiquete térmico de Facturación Electrónica POS
   */
  async generateFacturaTicketData(giro: Giro, facturacionData: any): Promise<any> {
    const createdByUser = giro.createdBy
    console.log(facturacionData)

    // Usamos los datos de la empresa desde Factus si están disponibles
    const company = facturacionData.company || {}
    const establishment = facturacionData.establishment || {}
    const bill = facturacionData.bill || {}
    const customer = facturacionData.customer || {}
    const items = facturacionData.items || []

    return {
      // Encabezado
      companyName: 'Inversiones RM',
      companyNit: company.nit ? `NIT: ${company.nit}-${company.dv || ''}` : '',
      companyPhone: establishment.phone_number || company.phone || '+57 302 341 4813',
      //companyAddress: establishment.address || company.direction || 'Cra 21 # 43 - 26 Av, Molinos',
      companyAddress: 'Cra 21 # 43 - 26 Av, Molinos',
      companyCity: establishment.municipality_id?.name || company.municipality || 'Dosquebradas, Risaralda',
      divider: '================================',

      // Info de la Factura
      facturaNumber: bill.number || `G-${giro.id.substring(0, 8)}`,
      createdAt: bill.created_at || formatDate(giro.facturaFecha || new Date()),

      // Info del giro original (referencia)
      giroId: giro.id,

      // Cliente
      clientName: customer.graphic_representation_name || customer.names || customer.legal_name || giro.beneficiaryName || 'Consumidor Final',
      clientNit: customer.identification ? `CC/NIT: ${customer.identification}` : '',
      clientAddress: customer.address || '',
      clientPhone: customer.phone || '',

      // Items
      items: items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: formatCurrency(Number(item.price)),
        total: formatCurrency(Number(item.total || (item.quantity * item.price)))
      })),

      // Totales
      grossValue: formatCurrency(Number(bill.gross_value || giro.amountInput)),
      taxAmount: formatCurrency(Number(bill.tax_amount || 0)),
      total: formatCurrency(Number(bill.total || giro.amountInput)),

      // QR / CUFE
      cufe: facturacionData.cufe || bill.cufe || '',
      qr: bill.qr_image || bill.qr || '',

      // Creado por
      createdByName: createdByUser?.fullName || 'Sistema',

      // Footer
      timestamp: formatDate(new Date()),
      resolutionPrefix: facturacionData.numbering_range?.prefix || '',
      resolutionNumber: facturacionData.numbering_range?.resolution_number || '',
      resolutionFrom: facturacionData.numbering_range?.from || '',
      resolutionTo: facturacionData.numbering_range?.to || '',
      resolutionStartDate: facturacionData.numbering_range?.start_date || '',
      resolutionEndDate: facturacionData.numbering_range?.end_date || '',
    }
  }
}

export const thermalTicketService = new ThermalTicketService()

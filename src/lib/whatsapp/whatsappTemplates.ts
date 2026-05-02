import { WhatsAppComponent, WhatsAppTextParameter } from './whatsappClient'
import {
  WHATSAPP_TEMPLATE_GIRO_CREADO,
  WHATSAPP_TEMPLATE_GIRO_COMPLETADO,
} from '@/settings'

// ---- Helpers ----

function textParam(value: string): WhatsAppTextParameter {
  return { type: 'text', text: value }
}

function bodyComponent(parameters: WhatsAppTextParameter[]): WhatsAppComponent {
  return { type: 'body', parameters }
}

/**
 * Formatea un monto con separador de miles y 2 decimales.
 * Ej: 1500000 → "1.500.000,00"
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Retorna los últimos 8 caracteres de un ID como referencia corta.
 */
function shortRef(id: string): string {
  return id.slice(-8).toUpperCase()
}

/**
 * Traduce el tipo de ejecución a un nombre legible.
 */
function formatExecutionType(type?: string): string {
  const map: Record<string, string> = {
    TRANSFERENCIA: 'Transferencia',
    PAGO_MOVIL: 'Pago Móvil',
    EFECTIVO: 'Efectivo',
    ZELLE: 'Zelle',
    RECARGA: 'Recarga',
    OTROS: 'Otros',
  }
  return map[type || ''] || type || 'Transferencia'
}

// ---- Template Builders ----

export interface GiroCreadoData {
  beneficiaryName: string
  amountBs: number
  bankName: string
  accountNumber: string
  giroId: string
}

export interface GiroCompletadoData {
  beneficiaryName: string
  amountBs: number
  bankName: string
  executionType?: string
  giroId: string
}

/**
 * Construye los componentes para la plantilla `giro_creado`.
 * Se envía al remitente (el que envía dinero) para confirmar el registro.
 *
 * Variables en Meta:
 *   {{1}} = Monto Bs
 *   {{2}} = Nombre del beneficiario
 *   {{3}} = Banco destino
 *   {{4}} = Número de cuenta
 *   {{5}} = Referencia (ID corto)
 */
export function buildGiroCreadoTemplate(data: GiroCreadoData): {
  templateName: string
  components: WhatsAppComponent[]
} {
  return {
    templateName: WHATSAPP_TEMPLATE_GIRO_CREADO,
    components: [
      bodyComponent([
        textParam(formatAmount(data.amountBs)),
        textParam(data.beneficiaryName),
        textParam(data.bankName),
        textParam(data.accountNumber),
        textParam(shortRef(data.giroId)),
      ]),
    ],
  }
}

/**
 * Construye los componentes para la plantilla `giro_completado`.
 * Se envía al remitente (el que envía dinero) para confirmar la ejecución.
 *
 * Variables en Meta:
 *   {{1}} = Monto Bs
 *   {{2}} = Nombre del beneficiario
 *   {{3}} = Banco destino
 *   {{4}} = Método de ejecución
 *   {{5}} = Referencia (ID corto)
 */
export function buildGiroCompletadoTemplate(data: GiroCompletadoData): {
  templateName: string
  components: WhatsAppComponent[]
} {
  return {
    templateName: WHATSAPP_TEMPLATE_GIRO_COMPLETADO,
    components: [
      bodyComponent([
        textParam(formatAmount(data.amountBs)),
        textParam(data.beneficiaryName),
        textParam(data.bankName),
        textParam(formatExecutionType(data.executionType)),
        textParam(shortRef(data.giroId)),
      ]),
    ],
  }
}

import {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION,
  WHATSAPP_ENABLED,
  WHATSAPP_LANGUAGE_CODE,
  WHATSAPP_AUTOREPLY_MESSAGE,
} from '@/settings'
import { logger } from '@/lib/logger'

// ---- Types ----

export interface WhatsAppTextParameter {
  type: 'text'
  text: string
}

export interface WhatsAppImageParameter {
  type: 'image'
  image: {
    link?: string
    id?: string
  }
}

export type WhatsAppParameter = WhatsAppTextParameter | WhatsAppImageParameter

export interface WhatsAppComponent {
  type: 'header' | 'body' | 'button'
  parameters: WhatsAppParameter[]
  sub_type?: string
  index?: number
}

export interface WhatsAppSendResult {
  success: boolean
  messageId?: string
  error?: string
}

interface WhatsAppAPIResponse {
  messaging_product: string
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string }>
}

interface WhatsAppAPIError {
  error: {
    message: string
    type: string
    code: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

// ---- Helpers ----

/**
 * Normaliza un número de teléfono al formato E.164 sin el '+'.
 * Acepta formatos como: +573001234567, 573001234567, 3001234567 (asume Colombia)
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null

  // Eliminar espacios, guiones, paréntesis y el signo +
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '')

  // Si empieza con 0, quitarlo (prefijo local)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1)
  }

  // Si tiene 10 dígitos y empieza con 3, asumir Colombia (+57)
  if (cleaned.length === 10 && cleaned.startsWith('3')) {
    cleaned = `57${cleaned}`
  }

  // Validar que sea solo dígitos y tenga longitud razonable (10-15 dígitos)
  if (!/^\d{10,15}$/.test(cleaned)) {
    return null
  }

  return cleaned
}

// ---- Client ----

/**
 * Sube un archivo a los servidores de WhatsApp (Meta) y devuelve un Media ID.
 * Útil para enviar imágenes o documentos en plantillas cuando los archivos no son públicos.
 * 
 * @param fileBuffer - El buffer del archivo a subir
 * @param mimeType - El tipo MIME del archivo (ej: 'image/jpeg')
 * @returns El ID del medio subido (mediaId) o nulo si falla
 */
export async function uploadMediaToWhatsApp(fileBuffer: Buffer, mimeType: string): Promise<string | null> {
  if (!WHATSAPP_ENABLED || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return null
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/media`
  
  // Usar FormData nativo de Node.js (Node 18+)
  const formData = new FormData()
  formData.append('messaging_product', 'whatsapp')
  
  // Convertir Buffer a Blob para FormData
  const fileBlob = new Blob([fileBuffer], { type: mimeType })
  formData.append('file', fileBlob, 'media.jpg')

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.error({ error: errorData }, '[WHATSAPP] Error subiendo medio a Meta')
      return null
    }

    const data = await response.json() as { id: string }
    return data.id
  } catch (error) {
    logger.error({ error }, '[WHATSAPP] Excepción al subir medio a Meta')
    return null
  }
}

/**
 * Envía un mensaje de texto plano por WhatsApp usando la Meta Cloud API.
 * Válido dentro de la ventana de 24 horas de conversación iniciada por el usuario.
 */
export async function sendTextMessage(
  to: string,
  text: string
): Promise<WhatsAppSendResult> {
  if (!WHATSAPP_ENABLED) {
    logger.info(`[WHATSAPP] Deshabilitado. Texto a ${to} no enviado.`)
    return { success: false, error: 'WHATSAPP_DISABLED' }
  }

  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    logger.error('[WHATSAPP] Faltan credenciales.')
    return { success: false, error: 'MISSING_CREDENTIALS' }
  }

  const normalizedPhone = normalizePhoneNumber(to)
  if (!normalizedPhone) {
    logger.warn(`[WHATSAPP] Número inválido: "${to}"`)
    return { success: false, error: 'INVALID_PHONE_NUMBER' }
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedPhone,
    type: 'text',
    text: { body: text },
  }

  try {
    logger.info(`[WHATSAPP] Enviando texto a ${normalizedPhone}...`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = (await response.json()) as WhatsAppAPIError
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}`
      logger.error({ status: response.status, error: errorData }, `[WHATSAPP] Error enviando texto: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }

    const data = (await response.json()) as WhatsAppAPIResponse
    logger.info(`[WHATSAPP] ✅ Texto enviado. ID: ${data.messages?.[0]?.id}, Destino: ${normalizedPhone}`)
    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (error) {
    logger.error({ error }, `[WHATSAPP] Error de red al enviar texto a ${normalizedPhone}`)
    return { success: false, error: error instanceof Error ? error.message : 'NETWORK_ERROR' }
  }
}

/**
 * Envía un mensaje de plantilla por WhatsApp usando la Meta Cloud API.
 *
 * @param to - Número de teléfono destino (se normaliza automáticamente)
 * @param templateName - Nombre de la plantilla aprobada en Meta
 * @param languageCode - Código de idioma (default: 'es')
 * @param components - Componentes de la plantilla (variables)
 */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string = WHATSAPP_LANGUAGE_CODE,
  components?: WhatsAppComponent[]
): Promise<WhatsAppSendResult> {
  // Verificar si WhatsApp está habilitado
  if (!WHATSAPP_ENABLED) {
    logger.info(`[WHATSAPP] Deshabilitado. Mensaje a ${to} con plantilla "${templateName}" no enviado.`)
    return { success: false, error: 'WHATSAPP_DISABLED' }
  }

  // Validar configuración
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    logger.error('[WHATSAPP] Faltan credenciales. Configurar WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en .env')
    return { success: false, error: 'MISSING_CREDENTIALS' }
  }

  // Normalizar número
  const normalizedPhone = normalizePhoneNumber(to)
  if (!normalizedPhone) {
    logger.warn(`[WHATSAPP] Número de teléfono inválido: "${to}"`)
    return { success: false, error: 'INVALID_PHONE_NUMBER' }
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: normalizedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      ...(components && components.length > 0 ? { components } : {}),
    },
  }

  try {
    logger.info(
      `[WHATSAPP] Enviando plantilla "${templateName}" a ${normalizedPhone}...`
    )

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = (await response.json()) as WhatsAppAPIError
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}`
      logger.error(
        { status: response.status, error: errorData },
        `[WHATSAPP] Error enviando mensaje: ${errorMsg}`
      )
      return { success: false, error: errorMsg }
    }

    const data = (await response.json()) as WhatsAppAPIResponse
    const messageId = data.messages?.[0]?.id

    logger.info(
      `[WHATSAPP] ✅ Mensaje enviado exitosamente. ID: ${messageId}, Destino: ${normalizedPhone}`
    )

    return { success: true, messageId }
  } catch (error) {
    logger.error({ error }, `[WHATSAPP] Error de red al enviar mensaje a ${normalizedPhone}`)
    return { success: false, error: error instanceof Error ? error.message : 'NETWORK_ERROR' }
  }
}

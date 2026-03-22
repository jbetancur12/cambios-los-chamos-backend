import { logger } from '../lib/logger'
import {
  FACTUS_API_URL,
  FACTUS_CLIENT_ID,
  FACTUS_CLIENT_SECRET,
  FACTUS_USERNAME,
  FACTUS_PASSWORD,
} from '../settings'
import { Giro } from '../entities/Giro'
import { CustomerInvoiceData } from '../entities/CustomerInvoiceData'

// Simplified Cache for token
let factusAccessToken: string | null = null
let factusTokenExpiresAt: number = 0

export const facturacionService = {
  /**
   * Obtiene o refresca el token de acceso de Factus usando grant_type: password.
   */
  async getAccessToken(): Promise<string> {
    if (factusAccessToken && Date.now() < factusTokenExpiresAt) {
      return factusAccessToken
    }

    logger.info('[FACTUS] Obteniendo nuevo token de acceso...')

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: FACTUS_CLIENT_ID,
      client_secret: FACTUS_CLIENT_SECRET,
      username: FACTUS_USERNAME,
      password: FACTUS_PASSWORD,
    })

    const response = await fetch(`${FACTUS_API_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error({ errorText, status: response.status }, '[FACTUS] Error al autenticar con Factus API')
      throw new Error('No se pudo obtener el token de facturación')
    }

    const data = await response.json() as { access_token: string; expires_in: number }
    factusAccessToken = data.access_token
    // expires_in is usually in seconds (e.g., 3600), we subtract 60 seconds for safety margin
    factusTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000

    return factusAccessToken
  },

  /**
   * Genera una Factura Electrónica de Venta (Document Type "01") en Factus
   * basándose en la información del giro completado.
   */
  async emitirFactura(giro: Giro, customer?: CustomerInvoiceData, billingType: 'STANDARD' | 'MANDATO' = 'STANDARD', mandanteIdentification?: string) {
    const token = await this.getAccessToken()

    const todayDate = new Date().toISOString().split('T')[0]

    // Construir el objeto cliente
    let customerData
    if (customer) {
      customerData = {
        identification: customer.identification,
        dv: customer.dv || "",
        names: customer.names,
        address: customer.address,
        email: customer.email,
        phone: customer.phone,
        legal_organization_id: "2", // Persona Natural por defecto
        tribute_id: customer.tribute_id?.toString() || "21",
        identification_document_id: "3", // Cédula de Ciudadanía
        municipality_id: customer.municipality_id?.toString() || "980" // Bogotá
      }
    } else {
      // Consumidor Final
      customerData = {
        identification: "222222222222",
        dv: "",
        names: "Consumidor Final",
        address: "",
        email: "",
        phone: "",
        legal_organization_id: "2",
        tribute_id: "21",
        identification_document_id: "3", // Cedula (para consumidor final a veces piden 3, 6, o 13)
        municipality_id: "980"
      }
    }
    
    const resolveMandanteIdentification = mandanteIdentification || giro.beneficiaryId || "222222222222"

    // Configuración del Payload para Factus 
    const numberingRangeId = parseInt(process.env.FACTUS_NUMBERING_RANGE_ID || '1523', 10)

    let itemsPayload: any[] = []
    
    if (billingType === 'MANDATO') {
      const profit = Number((giro.systemProfit + giro.minoristaProfit).toFixed(2))
      const thirdPartyAmount = Number((giro.amountInput - profit).toFixed(2))
      
      itemsPayload = [
        {
          code_reference: "GIRO-CM-01",
          name: `Comisión por envío de dinero (Ref: ${giro.id.substring(0,8)})`,
          quantity: 1,
          discount_rate: 0,
          price: profit,
          tax_rate: "0.00",
          unit_measure_id: 70,
          standard_code_id: 1,
          is_excluded: 1,
          tribute_id: 1,
          scheme_id: "0" // 0 = Ingreso propio
        },
        {
          code_reference: "GIRO-TR-01",
          name: `Ingreso para terceros - Envío a ${giro.bankName}`,
          quantity: 1,
          discount_rate: 0,
          price: thirdPartyAmount,
          tax_rate: "0.00",
          unit_measure_id: 70,
          standard_code_id: 1,
          is_excluded: 1,
          tribute_id: 1,
          scheme_id: "1", // 1 = Ingresos recibidos para terceros
          mandate: {
            identification_document_id: 3, // Cédula de Ciudadanía por defecto para el beneficiario/remitente empírico
            identification: resolveMandanteIdentification
          }
        }
      ]
    } else {
      itemsPayload = [
        {
          code_reference: "GIRO-SV-01",
          name: `Envío de dinero a ${giro.bankName}`,
          quantity: 1,
          discount_rate: 0,
          price: giro.amountInput,
          tax_rate: "0.00",
          unit_measure_id: 70,
          standard_code_id: 1,
          is_excluded: 1,
          tribute_id: 1,
        }
      ]
    }

    const payload = {
      // "01" es Factura Electrónica de Venta
      document: "01",
      numbering_range_id: numberingRangeId,
      reference_code: `G-${giro.id.substring(0, 8)}`,
      observation: `Servicio de giro (Ref: ${giro.id})`,
      payment_method_code: "47",
      operation_type: billingType === 'MANDATO' ? "11" : "10",
      customer: customerData,
      items: itemsPayload
    }

    logger.info(`[FACTUS] Enviando factura para Giro ${giro.id}`)

    const response = await fetch(`${FACTUS_API_URL}/v1/bills/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json() as any

    if (!response.ok) {
      logger.error({ status: response.status, body: result }, '[FACTUS] Error al generar factura')

      let errorDetails = result.message || 'Error desconocido'
      if (result.data && result.data.errors) {
        errorDetails += `: ${JSON.stringify(result.data.errors)}`
      } else if (result.errors) {
        errorDetails += `: ${JSON.stringify(result.errors)}`
      }

      throw new Error(`Error en API Factus: ${errorDetails}`)
    }

    return result
  },

  /**
   * Descarga el PDF en base64 de una factura generada
   */
  async descargarPdf(facturaNumber: string): Promise<string> {
    const token = await this.getAccessToken()
    const response = await fetch(`${FACTUS_API_URL}/v1/bills/download-pdf/${facturaNumber}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
      throw new Error('No se pudo descargar el PDF de la factura desde Factus')
    }

    const data = await response.json() as any
    return data.data.pdf_base_64_encoded || ''
  },

  async descargarXml(facturaNumber: string): Promise<string> {
    const token = await this.getAccessToken()
    const response = await fetch(`${FACTUS_API_URL}/v1/bills/download-xml/${facturaNumber}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
      throw new Error('No se pudo descargar el XML de la factura desde Factus')
    }

    const data = await response.json() as any
    return data.data.xml_base_64_encoded || ''
  },

  /**
   * Obtiene los detalles de una factura generada en Factus por su número
   */
  async getFacturaById(facturaNumber: string): Promise<any> {
    const token = await this.getAccessToken()
    const response = await fetch(`${FACTUS_API_URL}/v1/bills/show/${facturaNumber}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('No se pudo obtener la información de la factura desde Factus')
    }

    const data = await response.json() as any
    return data.data
  },

  /**
   * Obtiene la lista de municipios desde la API de Factus
   * Opcionalmente filtra por nombre
   */
  async getMunicipalities(name?: string): Promise<any[]> {
    const token = await this.getAccessToken()

    let url = `${FACTUS_API_URL}/v1/municipalities`
    if (name && name.trim() !== '') {
      url += `?name=${encodeURIComponent(name.trim())}`
    }

    // factus Sandbox API endpoint is somewhat unstable in its URLs, the standard v1 works
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      logger.error({ status: response.status }, '[FACTUS] Error al obtener municipios')
      throw new Error('No se pudieron obtener los municipios de Factus')
    }

    const result = await response.json() as any
    // Typically Factus returns data in `data` array
    return result.data || []
  }
}

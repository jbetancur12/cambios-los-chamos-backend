// Re-export público del módulo WhatsApp
export { sendTemplateMessage, normalizePhoneNumber } from './whatsappClient'
export type { WhatsAppComponent, WhatsAppTextParameter, WhatsAppSendResult } from './whatsappClient'

export {
  buildGiroCreadoTemplate,
  buildGiroCompletadoTemplate,
} from './whatsappTemplates'
export type { GiroCreadoData, GiroCompletadoData } from './whatsappTemplates'

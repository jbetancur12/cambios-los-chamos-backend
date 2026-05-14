import { Giro } from '@/entities/Giro'
import { logger } from '@/lib/logger'
import {
  sendTemplateMessage,
  buildGiroCreadoTemplate,
  buildGiroCompletadoTemplate,
  uploadMediaToWhatsApp,
} from '@/lib/whatsapp'
import { minioService } from '@/services/MinIOService'

/**
 * Servicio de notificaciones WhatsApp para giros.
 *
 * Envía mensajes al número del REMITENTE (giro.senderPhone), quien es la
 * persona que envió dinero. Este campo es opcional — si no está configurado,
 * la notificación se omite silenciosamente.
 *
 * Diseñado para ser fire-and-forget: nunca bloquea ni causa rollback.
 */
export class WhatsAppNotificationService {
  /**
   * Notifica al remitente que su giro fue creado exitosamente.
   */
  async notifyGiroCreated(giro: Giro): Promise<void> {
    if (!giro.senderPhone) {
      logger.debug(
        `[WHATSAPP-GIRO] Giro ${giro.id} sin senderPhone. Omitiendo notificación de creación.`
      )
      return
    }

    const { templateName, components } = buildGiroCreadoTemplate({
      beneficiaryName: giro.beneficiaryName,
      amountBs: Number(giro.amountBs),
      bankName: giro.bankName,
      accountNumber: giro.accountNumber,
      giroId: giro.id,
    })

    const result = await sendTemplateMessage(giro.senderPhone, templateName, undefined, components)

    if (result.success) {
      logger.info(
        `[WHATSAPP-GIRO] ✅ Giro creado notificado. ID: ${giro.id}, Tel: ${giro.senderPhone}, MsgID: ${result.messageId}`
      )
    } else {
      logger.warn(
        `[WHATSAPP-GIRO] ⚠️ No se pudo notificar giro creado. ID: ${giro.id}, Tel: ${giro.senderPhone}, Error: ${result.error}`
      )
    }
  }

  /**
   * Notifica al remitente que su giro fue completado/ejecutado.
   */
  async notifyGiroCompleted(giro: Giro): Promise<void> {
    if (!giro.senderPhone) {
      logger.debug(
        `[WHATSAPP-GIRO] Giro ${giro.id} sin senderPhone. Omitiendo notificación de completado.`
      )
      return
    }

    let proofUrl: string | undefined = undefined
    let proofMediaId: string | undefined = undefined

    if (giro.paymentProofKey) {
      try {
        const bucketName = process.env.MINIO_BUCKET_NAME || 'ultrathink'
        
        // 1. Intentar subir el archivo directamente a Meta para evitar problemas de URLs locales
        try {
          const fileBuffer = await minioService.getFileAsBuffer(bucketName, giro.paymentProofKey)
          // Asumimos JPEG por defecto, MinIO Service tipicamente guarda como JPG después del procesamiento
          const mediaId = await uploadMediaToWhatsApp(fileBuffer, 'image/jpeg')
          if (mediaId) {
            proofMediaId = mediaId
          }
        } catch (uploadError) {
          logger.warn({ uploadError }, `[WHATSAPP-GIRO] No se pudo subir el archivo a Meta directamente, usando URL de MinIO.`)
        }

        // 2. Si falló la subida directa, usar URL prefirmada (puede fallar en local si Meta no tiene acceso a localhost)
        if (!proofMediaId) {
          proofUrl = await minioService.getPresignedUrl(bucketName, giro.paymentProofKey, 24 * 60 * 60)
        }
      } catch (error) {
        logger.warn({ error }, `[WHATSAPP-GIRO] No se pudo generar URL o ID de medio para el comprobante del giro ${giro.id}`)
      }
    }

    const { templateName, components } = buildGiroCompletadoTemplate({
      beneficiaryName: giro.beneficiaryName,
      amountBs: Number(giro.amountBs),
      bankName: giro.bankName,
      executionType: giro.executionType,
      giroId: giro.id,
      proofUrl,
      proofMediaId,
    })

    const result = await sendTemplateMessage(giro.senderPhone, templateName, undefined, components)

    if (result.success) {
      logger.info(
        `[WHATSAPP-GIRO] ✅ Giro completado notificado. ID: ${giro.id}, Tel: ${giro.senderPhone}, MsgID: ${result.messageId}`
      )
    } else {
      logger.warn(
        `[WHATSAPP-GIRO] ⚠️ No se pudo notificar giro completado. ID: ${giro.id}, Tel: ${giro.senderPhone}, Error: ${result.error}`
      )
    }
  }
}

// Singleton export
export const whatsAppNotificationService = new WhatsAppNotificationService()

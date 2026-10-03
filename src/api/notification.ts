import { Request, Response, Router } from 'express'
// Importamos directamente el servicio singleton
import { notificationService } from '../services/NotificationService'
import { ApiResponse } from '@/lib/apiResponse'
import { logger } from '@/lib/logger'
import { requireAuth } from '@/middleware/authMiddleware'

export const notificationRouter = Router()

// Endpoint para guardar o actualizar el token FCM del usuario.
// Requiere sesión y registra el token siempre bajo el usuario de la sesión: el userId del cuerpo
// se ignora, para que nadie pueda registrar su dispositivo bajo otra persona y recibir sus avisos.
notificationRouter.post('/save-token', requireAuth(), async (req: Request, res: Response) => {
  const user = req.context?.requestUser?.user
  if (!user) {
    return res.status(401).json(ApiResponse.unauthorized())
  }

  const { userId, token } = req.body

  if (!token || typeof token !== 'string') {
    return res.status(400).json(ApiResponse.error('Datos incompletos o inválidos: token es requerido.'))
  }

  if (userId && userId !== user.id) {
    logger.warn({ sessionUserId: user.id, bodyUserId: userId }, '[FCM] save-token: el userId del cuerpo no coincide con la sesión, se ignora')
  }

  // El servicio se usa directamente ya que es un singleton y maneja DI internamente
  try {
    await notificationService.saveOrUpdateFcmToken(user.id, token)

    // Respuesta de éxito (status 200 OK)
    return res.status(200).json(ApiResponse.success({ message: 'Token de FCM guardado/actualizado correctamente.' }))
  } catch (error) {
    // Manejo de errores (ej. si el usuario no existe en la DB)
    logger.error({ error }, 'Error en el endpoint /api/fcm/save-token')

    // Si es un error conocido (como usuario no encontrado)
    if (error instanceof Error && error.message.includes('Usuario no válido')) {
      return res.status(404).json(ApiResponse.notFound('Usuario asociado al token no encontrado.'))
    }

    // Error interno por defecto
    return res.status(500).json(ApiResponse.error('Error interno del servidor al procesar el token.'))
  }
})

export default notificationRouter

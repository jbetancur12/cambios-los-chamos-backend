// Importamos la entidad User para la relación.
import { User } from '../entities/User'
// Usamos el nombre y la ruta de la entidad de tokens que especificaste
import { UserFcmToken } from '@/entities/UserFcmToken'
// Importamos la inyección de dependencias global de tu proyecto
import { DI } from '@/di'

/**
 * Servicio encargado de gestionar el registro y actualización de tokens FCM
 * y el envío de notificaciones.
 */
export class NotificationService {
  // No se necesita el constructor si usas DI global

  /**
   * Guarda o actualiza un token de FCM en la base de datos, asociándolo a un usuario.
   * Este método gestiona el "upsert" del token.
   * @param userId - ID del usuario (Transferencista, Administrador, etc.) logueado.
   * @param fcmToken - Token de FCM proporcionado por el dispositivo.
   */
  public async saveOrUpdateFcmToken(userId: string, fcmToken: string): Promise<void> {
    // Obtenemos los repositorios a través de la inyección global (DI)
    // Nota: Asumimos que UserRepo es la entidad User (para findOneOrFail)
    const userRepo = DI.em.getRepository(User)
    const userFcmTokenRepo = DI.em.getRepository(UserFcmToken) // Repositorio de tokens FCM

    try {
      // 1. Buscar la entidad User
      const user = await userRepo.findOneOrFail({ id: userId })

      // 2. Intentar encontrar un registro de token existente
      const tokenRecord = await userFcmTokenRepo.findOne({ fcmToken })

      if (tokenRecord) {
        // Caso 1: El token ya existe (ej: el usuario recargó la app o es el mismo dispositivo).
        // Aseguramos que el registro esté asociado al usuario correcto.
        if (tokenRecord.user.id !== userId) {
          // Si el token estaba asociado a otro usuario, lo reasignamos.
          tokenRecord.user = user
        }
        // El onUpdate de la entidad actualizará el 'updatedAt'.
        await DI.em.persistAndFlush(tokenRecord)
        console.log(`[FCM] Token ${fcmToken} existente, marca de tiempo actualizada para userId: ${userId}.`)
        return
      }

      // Caso 2: El token es nuevo (primer registro o dispositivo diferente).
      const newToken = userFcmTokenRepo.create({
        fcmToken: fcmToken,
        user: user, // Relación ManyToOne establecida
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await DI.em.persistAndFlush(newToken)
      console.log(`[FCM] Nuevo token guardado para el usuario: ${userId}`)
    } catch (error) {
      // Si el usuario no se encuentra (findOneOrFail falla)
      console.error(`[FCM] Error al guardar token: Usuario ${userId} no encontrado o error de DB.`, error)
      throw new Error('Usuario no válido o error de base de datos.')
    }
  }
}

// Exportamos una instancia del servicio para que sea un singleton en el proyecto
export const notificationService = new NotificationService()

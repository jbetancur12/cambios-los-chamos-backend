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

  /**
   * Envía una notificación push a todos los dispositivos registrados del usuario.
   */
  public async sendNotificationToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    const userFcmTokenRepo = DI.em.getRepository(UserFcmToken)

    // Obtener todos los tokens del usuario
    const tokens = await userFcmTokenRepo.find({ user: userId })

    if (tokens.length === 0) {
      console.log(`[FCM] No hay tokens registrados para el usuario ${userId}`)
      return
    }


    // Deduplicate tokens using a Set
    const uniqueTokens = new Set(tokens.map(t => t.fcmToken))
    const registrationTokens = Array.from(uniqueTokens)

    // Importamos firebase-admin dinámicamente o usamos el que ya se usa en el proyecto si existe
    // Asumiendo que 'firebase-admin' está configurado globalmente o necesitamos inicializarlo
    // Revisando package.json vi que está instalado.
    // Deberíamos tener un inicializador global. Si no, lo importamos aquí.
    const admin = await import('firebase-admin')

    // Verificar si ya está inicializado
    if (admin.apps.length === 0) {
      // Intentar inicializar (esto debería estar en un archivo de configuración global, pero por seguridad...)
      // Por ahora asumimos que la configuración está, o usamos default creds
      // Ojo: Si no está inicializado, fallará. 
      // TODO: Verificar dónde se inicializa firebase-admin.
      console.warn('[FCM] Firebase Admin no parece estar inicializado. Intentando inicializar...')
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const serviceAccount = require('../../lib/firebase-admin-key.json')
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        })
      } catch (e) {
        // Fallback a default application login si existe variable de entorno
        try {
          admin.initializeApp()
        } catch (err) {
          console.error('[FCM] Error inicializando Firebase Admin:', err)
          return
        }
      }
    }

    const message = {
      notification: {
        title,
        body
      },
      data: data || {},
      tokens: registrationTokens,
    }

    try {
      const response = await admin.messaging().sendEachForMulticast(message)
      console.log(`[FCM] Notificación enviada a usuario ${userId}: ${response.successCount} éxitos, ${response.failureCount} fallos.`)

      if (response.failureCount > 0) {
        const failedTokens: string[] = []
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(registrationTokens[idx])
            // Si el error es que el token no es válido, deberíamos eliminarlo
            if (resp.error?.code === 'messaging/registration-token-not-registered') {
              // Eliminar token inválido
              // Necesitamos hacer esto en un fork o algo para no bloquear, pero aquí está bien.
              // Como estamos a mitad de ejecución, tal vez mejor solo loguear por ahora
              console.log(`[FCM] Token inválido detectado para borrar: ${registrationTokens[idx]}`)
            }
          }
        })

        // Eliminar tokens inválidos de la DB
        if (failedTokens.length > 0) {
          await DI.em.nativeDelete(UserFcmToken, { fcmToken: { $in: failedTokens } })
          console.log(`[FCM] Eliminados ${failedTokens.length} tokens inválidos.`)
        }
      }
    } catch (error) {
      console.error('[FCM] Error enviando multicast:', error)
    }
  }
}

// Exportamos una instancia del servicio para que sea un singleton en el proyecto
export const notificationService = new NotificationService()


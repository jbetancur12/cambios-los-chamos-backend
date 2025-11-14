import { Request, Response, Router } from 'express';
// Importamos directamente el servicio singleton
import { notificationService } from '../services/NotificationService'; 
import { ApiResponse } from '@/lib/apiResponse';


export const notificationRouter = Router();

// Endpoint para guardar o actualizar el token FCM del usuario.
notificationRouter.post('/save-token', async (req: Request, res: Response) => {
    
    // Los datos vienen del body de la solicitud del frontend
    const { userId, token } = req.body;

    if (!userId || typeof userId !== 'string' || !token || typeof token !== 'string') {
        return res.status(400).json(
            ApiResponse.error('Datos incompletos o inválidos: userId y token son requeridos.')
        );
    }
    
    // El servicio se usa directamente ya que es un singleton y maneja DI internamente
    try {
        await notificationService.saveOrUpdateFcmToken(userId, token);
        
        // Respuesta de éxito (status 200 OK)
        return res.status(200).json(
            ApiResponse.success({ message: 'Token de FCM guardado/actualizado correctamente.' })
        );

    } catch (error) {
        // Manejo de errores (ej. si el usuario no existe en la DB)
        console.error('Error en el endpoint /api/fcm/save-token:', error);

        // Si es un error conocido (como usuario no encontrado)
        if (error instanceof Error && error.message.includes('Usuario no válido')) {
            return res.status(404).json(
                ApiResponse.notFound('Usuario asociado al token no encontrado.')
            );
        }
        
        // Error interno por defecto
        return res.status(500).json(
            ApiResponse.error('Error interno del servidor al procesar el token.')
        );
    }
});

export default notificationRouter;
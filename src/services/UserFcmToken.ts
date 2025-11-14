// Lógica de ejemplo en tu controlador/servicio de Express

import { User } from '@/entities/User';
import { UserFcmToken } from '@/entities/UserFcmToken';
import { EntityManager } from '@mikro-orm/core';


// ... (asume que tienes acceso al EntityManager, 'em')

export const saveToken = async (em: EntityManager, userId: string, fcmToken: string) => {
    
    // 1. Verificar si el token ya existe (ej: el usuario recarga la app)
    let tokenRecord = await em.findOne(UserFcmToken, { fcmToken });

    if (tokenRecord) {
        // El token ya existe: Solo actualizamos la marca de tiempo (o no hacemos nada)
        console.log('Token ya existe, actualización omitida.');
        // Si el user_id hubiera cambiado, lo actualizaríamos aquí, pero no debería pasar.
        return;
    }

    // 2. Si es un token nuevo para ese usuario (ej: nuevo dispositivo)
    
    // Buscamos la entidad User para la relación
    const user = await em.findOneOrFail(User, { id: userId });

    // Insertamos el nuevo token
    tokenRecord = em.create(UserFcmToken, {
        fcmToken: fcmToken,
        user: user, // Relación directa con la entidad User
        createdAt: new Date(),
        updatedAt: new Date()
    });

    await em.persistAndFlush(tokenRecord);
    console.log(`Nuevo token guardado para el usuario: ${userId}`);
};
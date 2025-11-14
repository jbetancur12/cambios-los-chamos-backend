import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
// Asumo que tienes una entidad User o Transferencista definida
import { User } from './User'; // Ajusta la ruta y el nombre si tu entidad de usuario es diferente

@Entity({ tableName: 'user_fcm_tokens' })
export class UserFcmToken {

  // ID primario (auto-generado)
  @PrimaryKey()
  id!: number;

  // El token de FCM: Es un string largo y debe ser único. 
  // Podríamos usarlo como PrimaryKey, pero un ID incremental es más seguro.
  // Es muy importante que sea UNIQUE para evitar duplicados y facilitar búsquedas.
  @Unique()
  @Property({ type: 'text' })
  fcmToken!: string;

  // Relación con el usuario: Un token pertenece a un usuario (ManyToOne)
  // Nota: Si un usuario solo puede tener UN token activo, se usaría @OneToOne. 
  // Aquí usamos ManyToOne porque un usuario puede iniciar sesión en varios dispositivos.
  @ManyToOne(() => User, { deleteRule: 'cascade', updateRule: 'cascade' })
  user!: User;

  // Marca de tiempo de creación
  @Property()
  createdAt: Date = new Date();

  // Marca de tiempo de actualización (se actualiza automáticamente en cada cambio)
  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

/**
 * Entidad singleton para trackear el siguiente transferencista a asignar (round-robin)
 */
@Entity({ tableName: 'transferencista_assignment_tracker' })
export class TransferencistaAssignmentTracker {
  @PrimaryKey()
  id: number = 1 // Siempre será 1 (singleton)

  @Property({ type: 'int', default: 0 })
  lastAssignedIndex: number = 0

  @Property({ type: 'datetime', onCreate: () => new Date() })
  updatedAt: Date = new Date()
}

import { Entity, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'

export enum TokenType {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

@Entity({ tableName: 'user_tokens' })
export class UserToken {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => User)
  user!: User

  @Property({ unique: true })
  token!: string

  @Enum(() => TokenType)
  type!: TokenType

  @Property()
  expiresAt!: Date

  @Property({ default: false })
  used: boolean = false

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()
}

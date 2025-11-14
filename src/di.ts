import http from 'http'
import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/postgresql'
import config from '@/mikro-orm.config'
import { User } from '@/entities/User'
import { BankAccount } from './entities/BankAccount'
import { Transferencista } from './entities/Transferencista'
import { ExchangeRate } from './entities/ExchangeRate'
import { Bank } from './entities/Bank'
import { Minorista } from './entities/Minorista'
import { Giro } from './entities/Giro'
import { MinoristaTransaction } from './entities/MinoristaTransaction'
import { BankTransaction } from './entities/BankTransaction'
import { BankAccountTransaction } from './entities/BankAccountTransaction'
import { UserToken } from './entities/UserToken'
import { BankAssignment } from './entities/BankAssignment'
import { TransferencistaAssignmentTracker } from './entities/TransferencistaAssignmentTracker'
import { RechargeOperator } from './entities/RechargeOperator'
import { RechargeAmount } from './entities/RechargeAmount'
import { UserFcmToken} from './entities/UserFcmToken';

export const DI = {} as {
  server: http.Server
  orm: MikroORM
  em: EntityManager
  users: EntityRepository<User>
  userTokens: EntityRepository<UserToken>
  banks: EntityRepository<Bank>
  bankAccounts: EntityRepository<BankAccount>
  bankTransactions: EntityRepository<BankTransaction>
  bankAccountTransactions: EntityRepository<BankAccountTransaction>
  bankAssignments: EntityRepository<BankAssignment>
  exchangeRates: EntityRepository<ExchangeRate>
  giros: EntityRepository<Giro>
  minoristas: EntityRepository<Minorista>
  minoristaTransactions: EntityRepository<MinoristaTransaction>
  transferencistas: EntityRepository<Transferencista>
  transferencistaAssignmentTracker: EntityRepository<TransferencistaAssignmentTracker>
  rechargeOperators: EntityRepository<RechargeOperator>
  rechargeAmounts: EntityRepository<RechargeAmount>
  userFcmTokens: EntityRepository<UserFcmToken>
}

export const initDI = async (): Promise<typeof DI> => {
  DI.orm = await MikroORM.init(config)
  DI.em = DI.orm.em
  DI.users = DI.orm.em.getRepository(User)
  DI.userTokens = DI.orm.em.getRepository(UserToken)
  DI.banks = DI.orm.em.getRepository(Bank)
  DI.bankAccounts = DI.orm.em.getRepository(BankAccount)
  DI.bankTransactions = DI.orm.em.getRepository(BankTransaction)
  DI.bankAccountTransactions = DI.orm.em.getRepository(BankAccountTransaction)
  DI.bankAssignments = DI.orm.em.getRepository(BankAssignment)
  DI.exchangeRates = DI.orm.em.getRepository(ExchangeRate)
  DI.giros = DI.orm.em.getRepository(Giro)
  DI.minoristas = DI.orm.em.getRepository(Minorista)
  DI.minoristaTransactions = DI.orm.em.getRepository(MinoristaTransaction)
  DI.transferencistas = DI.orm.em.getRepository(Transferencista)
  DI.transferencistaAssignmentTracker = DI.orm.em.getRepository(TransferencistaAssignmentTracker)
  DI.rechargeOperators = DI.orm.em.getRepository(RechargeOperator)
  DI.rechargeAmounts = DI.orm.em.getRepository(RechargeAmount)
  DI.userFcmTokens = DI.orm.em.getRepository(UserFcmToken)

  return DI
}

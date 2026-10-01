import 'reflect-metadata'
import { test } from 'node:test'
import { Client } from 'pg'
import { RequestContext, type EntityName } from '@mikro-orm/postgresql'
import { DI, initDI } from '@/di'
import { DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT } from '@/settings'

// Hard stop: the schema is dropped and recreated, so it must never be a real database
const assertTestDatabase = () => {
  if (!DB_NAME.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${DB_NAME}": the database name must end with "_test"`)
  }
}

const ensureTestDatabase = async () => {
  assertTestDatabase()
  const admin = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'postgres' })
  await admin.connect()
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME])
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${DB_NAME}"`)
  } finally {
    await admin.end()
  }
}

/** Creates the test database if needed and builds the schema from the entities. Call in `before`. */
export const setupTestDb = async () => {
  await ensureTestDatabase()
  await initDI()
  await DI.orm.getSchemaGenerator().refreshDatabase()
}

/** Empties every table. Call in `beforeEach` so each test starts from nothing. */
export const resetTestDb = async () => {
  assertTestDatabase()
  // One TRUNCATE for every table is far faster than clearing them one by one
  const tables = Object.values(DI.orm.getMetadata().getAll())
    .filter((meta) => meta.tableName && !meta.embeddable)
    .map((meta) => `"${meta.schema ?? 'public'}"."${meta.tableName}"`)
  await DI.orm.em.getConnection().execute(`TRUNCATE TABLE ${[...new Set(tables)].join(', ')} RESTART IDENTITY CASCADE`)
}

export const closeTestDb = async () => {
  await DI.orm.close(true)
}

/** Runs `fn` inside its own MikroORM request context, like one HTTP request would. */
export const inContext = <T>(fn: () => Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    RequestContext.create(DI.orm.em, () => {
      fn().then(resolve, reject)
    })
  })

/** `test()` whose body runs inside a request context. Pass `{ todo: '...' }` to record a known bug. */
export const dbTest = (name: string, fn: () => Promise<void>, options: { todo?: string | boolean } = {}) =>
  test(name, options, () => inContext(fn))

/** Reads a row straight from the database, bypassing the identity map (so it shows what was really saved). */
export const readFresh = async <T extends object>(entity: EntityName<T>, id: string): Promise<T> => {
  const row = await DI.orm.em.fork().findOne(entity, { id } as never)
  if (!row) throw new Error(`Row not found: ${String(id)}`)
  return row as T
}

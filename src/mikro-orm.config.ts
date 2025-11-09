import { defineConfig } from '@mikro-orm/postgresql'
import { Migrator } from '@mikro-orm/migrations'
import { TsMorphMetadataProvider } from '@mikro-orm/reflection'
import { DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT } from './settings'

export default defineConfig({
  entities: ['./dist/entities'], // Compiled entities (usadas en producción)
  entitiesTs: ['./src/entities'], // Source entities (usadas en desarrollo)

  dbName: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  port: DB_PORT,

  metadataProvider: TsMorphMetadataProvider, // 👈 NECESARIO para leer decoradores TypeScript
  extensions: [Migrator],

  pool: {
    min: 0,
    max: 20,
  },

  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    disableForeignKeys: false,
    allOrNothing: true,
    emit: 'ts',
  },
})

import { defineConfig } from '@mikro-orm/postgresql'
import { Migrator } from '@mikro-orm/migrations'
import { SeedManager } from '@mikro-orm/seeder'
import { TsMorphMetadataProvider } from '@mikro-orm/reflection'
import { DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT } from './settings'

export default defineConfig({
  entities: ['./dist/entities'], // Para producción
  entitiesTs: ['./src/entities'], // Para desarrollo con ts-node

  dbName: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  port: DB_PORT,

  metadataProvider: TsMorphMetadataProvider, // 👈 NECESARIO para leer decoradores TypeScript
  extensions: [Migrator, SeedManager],
  validate: false, // Deshabilitar validación estricta de entidades

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

  seeder: {
    path: './dist/seeders',
    pathTs: './src/seeders',
    defaultSeeder: 'DatabaseSeeder',
    glob: '!(*.d).{js,ts}',
    emit: 'ts',
  },
})

// Loaded before any application module. Points the app at a separate test database and turns off
// every external integration, so a test can never touch the development data or call a real service.
process.env.NODE_ENV = 'test'
process.env.IS_DEVELOPMENT = 'true'
process.env.LOG_LEVEL = 'silent'
process.env.DB_NAME = process.env.TEST_DB_NAME || 'cambios_los_chamos_test'
process.env.SENTRY_ENABLED = 'false'
process.env.SENTRY_DSN = ''

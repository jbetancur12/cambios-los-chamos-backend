import '@/settings' // loads .env
import '@/sentry' // must be initialized before the modules it instruments (express, http...)
import { startExpressServer } from '@/expressServer'
import { logger } from '@/lib/logger'

const startServer = async () => {
  try {
    logger.info('Iniciando servidor Express...')
    await startExpressServer()
  } catch (error) {
    logger.error({ error }, '🔥 Error detallado al iniciar el servidor Express:')
    process.exit(1)
  }
}

startServer()



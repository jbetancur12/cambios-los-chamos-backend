import '@/settings'
import { startExpressServer } from '@/expressServer'
import { logger } from '@/lib/logger'

const startServer = async () => {
  try {
    logger.info('Iniciando servidor Express...')
    await startExpressServer()
  } catch (error) {
    console.error('🔥 Error detallado al iniciar el servidor Express:')
    console.error(error)
    logger.error({ error }, 'Error al iniciar el servidor Express')
    process.exit(1)
  }
}

startServer()

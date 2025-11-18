import { EntityManager } from '@mikro-orm/core'
import { User } from '../entities/User'
import { PrinterConfig, PrinterType } from '../entities/PrinterConfig'

export class PrinterConfigService {
  constructor(private em: EntityManager) {}

  async getPrinterConfig(userId: string): Promise<PrinterConfig | null> {
    return await this.em.findOne(PrinterConfig, { user: { id: userId } })
  }

  async savePrinterConfig(userId: string, name: string, type: PrinterType): Promise<PrinterConfig> {
    const user = await this.em.findOne(User, { id: userId })
    if (!user) {
      throw new Error('Usuario no encontrado')
    }

    let config = await this.em.findOne(PrinterConfig, { user: { id: userId } })

    if (config) {
      // Actualizar configuración existente
      config.name = name
      config.type = type
    } else {
      // Crear nueva configuración
      config = new PrinterConfig()
      config.user = user
      config.name = name
      config.type = type
      this.em.persist(config)
    }

    await this.em.flush()
    return config
  }

  async deletePrinterConfig(userId: string): Promise<void> {
    const config = await this.em.findOne(PrinterConfig, { user: { id: userId } })
    if (config) {
      this.em.remove(config)
      await this.em.flush()
    }
  }

  async getAvailablePrinters(): Promise<string[]> {
    // Esta función detectará impresoras disponibles en el sistema
    // Por ahora, retorna una lista vacía que será completada en el cliente
    // ya que detectar impresoras desde el navegador requiere APIs específicas
    return []
  }
}

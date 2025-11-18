import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { z } from 'zod'
import { PrinterConfigService } from '@/services/PrinterConfigService'
import { DI } from '@/di'
import { PrinterType } from '@/entities/PrinterConfig'

export const printerConfigRouter = express.Router({ mergeParams: true })

// Schema para guardar configuración de impresora
const savePrinterConfigSchema = z.object({
  name: z.string().min(1, 'El nombre de la impresora es requerido'),
  type: z.enum(['thermal', 'injection'], { message: 'Tipo de impresora inválido' }),
})

// GET - Obtener configuración de impresora del usuario actual
printerConfigRouter.get('/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized('Usuario no autenticado'))
    }

    const printerConfigService = new PrinterConfigService(DI.em)
    const config = await printerConfigService.getPrinterConfig(userId)

    if (!config) {
      return res.json(ApiResponse.success({
        config: null,
        message: 'No hay configuración de impresora',
      }))
    }

    res.json(ApiResponse.success({
      config: {
        name: config.name,
        type: config.type,
      },
      message: 'Configuración obtenida exitosamente',
    }))
  } catch (error: any) {
    console.error('[PRINTER_CONFIG] Error getting config:', error)
    res.status(500).json(ApiResponse.error('Error al obtener configuración de impresora'))
  }
})

// POST - Guardar o actualizar configuración de impresora
printerConfigRouter.post('/config', requireAuth, validateBody(savePrinterConfigSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized('Usuario no autenticado'))
    }

    const { name, type } = req.body

    const printerConfigService = new PrinterConfigService(DI.em)
    const config = await printerConfigService.savePrinterConfig(userId, name, type as PrinterType)

    res.json(ApiResponse.success({
      config: {
        name: config.name,
        type: config.type,
      },
      message: 'Configuración de impresora guardada exitosamente',
    }))
  } catch (error: any) {
    console.error('[PRINTER_CONFIG] Error saving config:', error)
    res.status(500).json(ApiResponse.error('Error al guardar configuración de impresora'))
  }
})

// DELETE - Eliminar configuración de impresora
printerConfigRouter.delete('/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json(ApiResponse.unauthorized('Usuario no autenticado'))
    }

    const printerConfigService = new PrinterConfigService(DI.em)
    await printerConfigService.deletePrinterConfig(userId)

    res.json(ApiResponse.success({
      message: 'Configuración de impresora eliminada exitosamente',
    }))
  } catch (error: any) {
    console.error('[PRINTER_CONFIG] Error deleting config:', error)
    res.status(500).json(ApiResponse.error('Error al eliminar configuración de impresora'))
  }
})

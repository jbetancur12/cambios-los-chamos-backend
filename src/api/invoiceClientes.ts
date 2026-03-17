import { Router, Request, Response, RequestHandler } from 'express'
import { z } from 'zod'
import { customerInvoiceDataService } from '../services/customerInvoiceDataService'
import { facturacionService } from '../services/facturacionService'
import { logger } from '../lib/logger'

const router = Router()

// Schema to validate incoming registration data
const registerSchema = z.object({
  identification: z.string().min(1, 'La identificación es requerida'),
  dv: z.string().optional(),
  names: z.string().min(1, 'El nombre/razón social es requerido'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(1, 'El teléfono es requerido'),
  address: z.string().min(1, 'La dirección es requerida'),
  municipality_id: z.number().optional(),
  municipality_name: z.string().optional(),
  tribute_id: z.number().optional()
})

const registerCustomerInvoiceData: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = registerSchema.parse(req.body)
    const result = await customerInvoiceDataService.registerOrUpdate(validatedData)
    
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Validación fallida', errors: error.issues })
    } else {
      logger.error({ error }, 'Error registering customer invoice data')
      res.status(500).json({ success: false, message: 'Error interno del servidor' })
    }
  }
}

// Public endpoint for anyone to resgister their billing details
router.post('/register', registerCustomerInvoiceData)

// Endpoint to fetch by identification
router.get('/municipios', async (req: Request, res: Response): Promise<void> => {
  try {
    const name = req.query.name as string | undefined
    const list = await facturacionService.getMunicipalities(name)
    res.status(200).json({ success: true, data: list })
  } catch (error) {
    logger.error({ error }, 'Error fetching municipalities from FacturacionService')
    res.status(500).json({ success: false, message: 'Error obteniendo municipios' })
  }
})

// Protected endpoint to fetch all customers
import { requireAuth, requireRole } from '../middleware/authMiddleware'
import { UserRole } from '../entities/User'

router.get('/all', requireAuth(), requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await customerInvoiceDataService.getAll()
    res.status(200).json({ success: true, data: list })
  } catch (error) {
    logger.error({ error }, 'Error fetching all customer invoice data')
    res.status(500).json({ success: false, message: 'Error obteniendo lista de clientes' })
  }
})

// Endpoint to fetch by identification
router.get('/:identification', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identification } = req.params
    if (!identification) {
      res.status(400).json({ success: false, message: 'La identificación es requerida' })
      return
    }

    const customer = await customerInvoiceDataService.findByIdentification(identification)
    if (customer) {
      res.status(200).json({ success: true, data: customer })
    } else {
      res.status(404).json({ success: false, message: 'Cliente no encontrado' })
    }
  } catch (error) {
    logger.error({ error }, 'Error fetching customer invoice data')
    res.status(500).json({ success: false, message: 'Error interno del servidor' })
  }
})

export { router as invoiceClientesRouter }

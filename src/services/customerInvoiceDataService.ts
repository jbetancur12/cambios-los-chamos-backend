import { CustomerInvoiceData } from '../entities/CustomerInvoiceData'
import { DI } from '../di'
import { logger } from '../lib/logger'

export const customerInvoiceDataService = {
  async registerOrUpdate(data: {
    identification: string
    dv?: string
    names: string
    email: string
    phone: string
    address: string
    municipality_id?: number
    municipality_name?: string
    tribute_id?: number
  }): Promise<CustomerInvoiceData> {
    const { identification, ...updateData } = data
    
    // Check if customer already exists by identification
    const repo = DI.em.getRepository(CustomerInvoiceData)
    let customer = await repo.findOne({ identification })
    
    if (customer) {
      // Update existing
      customer.names = updateData.names
      customer.email = updateData.email
      customer.phone = updateData.phone
      customer.address = updateData.address
      if (updateData.dv !== undefined) customer.dv = updateData.dv
      if (updateData.municipality_id !== undefined) customer.municipality_id = updateData.municipality_id
      if (updateData.municipality_name !== undefined) customer.municipality_name = updateData.municipality_name
      if (updateData.tribute_id !== undefined) customer.tribute_id = updateData.tribute_id
      customer.updatedAt = new Date()
    } else {
      // Create new
      customer = repo.create(data)
    }
    
    await DI.em.persistAndFlush(customer)
    logger.info(`CustomerInvoiceData saved for identification: ${identification}`)
    
    return customer
  },

  async findByIdentification(identification: string): Promise<CustomerInvoiceData | null> {
    return DI.em.getRepository(CustomerInvoiceData).findOne({ identification })
  },
  
  async getAll(): Promise<CustomerInvoiceData[]> {
    return DI.em.getRepository(CustomerInvoiceData).findAll({ orderBy: { createdAt: 'DESC' } })
  }
}

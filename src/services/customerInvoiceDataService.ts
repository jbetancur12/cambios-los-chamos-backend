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
    identification_document_id?: string
    legal_organization_id?: string
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
      if (updateData.identification_document_id !== undefined) customer.identification_document_id = updateData.identification_document_id
      if (updateData.legal_organization_id !== undefined) customer.legal_organization_id = updateData.legal_organization_id
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

  async updateById(id: string, data: {
    identification?: string
    dv?: string
    names?: string
    email?: string
    phone?: string
    address?: string
    municipality_id?: number
    municipality_name?: string
    tribute_id?: number
    identification_document_id?: string
    legal_organization_id?: string
  }): Promise<CustomerInvoiceData | null> {
    const repo = DI.em.getRepository(CustomerInvoiceData)
    const customer = await repo.findOne({ id })
    if (!customer) {
      return null
    }
    if (data.identification !== undefined) customer.identification = data.identification
    if (data.dv !== undefined) customer.dv = data.dv
    if (data.names !== undefined) customer.names = data.names
    if (data.email !== undefined) customer.email = data.email
    if (data.phone !== undefined) customer.phone = data.phone
    if (data.address !== undefined) customer.address = data.address
    if (data.municipality_id !== undefined) customer.municipality_id = data.municipality_id
    if (data.municipality_name !== undefined) customer.municipality_name = data.municipality_name
    if (data.tribute_id !== undefined) customer.tribute_id = data.tribute_id
    if (data.identification_document_id !== undefined) customer.identification_document_id = data.identification_document_id
    if (data.legal_organization_id !== undefined) customer.legal_organization_id = data.legal_organization_id
    customer.updatedAt = new Date()
    await DI.em.persistAndFlush(customer)
    logger.info(`CustomerInvoiceData updated for id: ${id}`)
    return customer
  },
  
  async getAll(): Promise<CustomerInvoiceData[]> {
    return DI.em.getRepository(CustomerInvoiceData).findAll({ orderBy: { createdAt: 'DESC' } })
  }
}

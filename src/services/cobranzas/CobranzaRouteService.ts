import { DI } from '@/di'
import { CobranzaRoute } from '@/entities/CobranzaRoute'
import { CobranzaClient } from '@/entities/CobranzaClient'

export interface CreateCobranzaRouteInput {
  name: string
  description?: string
  cobradorId: string
  clientIds?: string[]
}

export class CobranzaRouteService {
  async create(data: CreateCobranzaRouteInput): Promise<CobranzaRoute | { error: 'COBRADOR_NOT_FOUND' }> {
    const cobrador = await DI.users.findOne({ id: data.cobradorId })
    if (!cobrador) {
      return { error: 'COBRADOR_NOT_FOUND' }
    }

    const route = DI.cobranzaRoutes.create({
      name: data.name,
      description: data.description,
      cobrador,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    if (data.clientIds?.length) {
      const clients = (await DI.cobranzaClients.find({ id: { $in: data.clientIds } })) as CobranzaClient[]
      clients.forEach((c) => route.clients.add(c))
    }

    await DI.em.persistAndFlush(route)
    return route
  }

  async list(): Promise<CobranzaRoute[]> {
    return DI.cobranzaRoutes.find({}, { populate: ['cobrador', 'clients'], orderBy: { name: 'ASC' } })
  }

  async getById(id: string): Promise<CobranzaRoute | null> {
    return DI.cobranzaRoutes.findOne({ id }, { populate: ['cobrador', 'clients'] })
  }

  async update(
    id: string,
    data: Partial<CreateCobranzaRouteInput>
  ): Promise<CobranzaRoute | { error: 'ROUTE_NOT_FOUND' | 'COBRADOR_NOT_FOUND' }> {
    const route = await DI.cobranzaRoutes.findOne({ id }, { populate: ['clients'] })
    if (!route) {
      return { error: 'ROUTE_NOT_FOUND' }
    }

    if (data.name !== undefined) route.name = data.name
    if (data.description !== undefined) route.description = data.description
    if (data.cobradorId !== undefined) {
      const cobrador = await DI.users.findOne({ id: data.cobradorId })
      if (!cobrador) {
        return { error: 'COBRADOR_NOT_FOUND' }
      }
      route.cobrador = cobrador
    }
    if (data.clientIds !== undefined) {
      const clients = (await DI.cobranzaClients.find({ id: { $in: data.clientIds } })) as CobranzaClient[]
      route.clients.set(clients)
    }

    await DI.em.persistAndFlush(route)
    return route
  }

  async assignClients(id: string, clientIds: string[]): Promise<CobranzaRoute | { error: 'ROUTE_NOT_FOUND' }> {
    const route = await DI.cobranzaRoutes.findOne({ id })
    if (!route) {
      return { error: 'ROUTE_NOT_FOUND' }
    }

    const clients = (await DI.cobranzaClients.find({ id: { $in: clientIds } })) as CobranzaClient[]
    clients.forEach((c) => route.clients.add(c))
    await DI.em.persistAndFlush(route)
    return route
  }

  async removeClient(id: string, clientId: string): Promise<CobranzaRoute | { error: 'ROUTE_NOT_FOUND' }> {
    const route = await DI.cobranzaRoutes.findOne({ id }, { populate: ['clients'] })
    if (!route) {
      return { error: 'ROUTE_NOT_FOUND' }
    }

    const client = route.clients.getItems().find((c) => c.id === clientId)
    if (client) {
      route.clients.remove(client)
      await DI.em.persistAndFlush(route)
    }
    return route
  }

  async remove(id: string): Promise<boolean | { error: 'ROUTE_NOT_FOUND' }> {
    const route = await DI.cobranzaRoutes.findOne({ id })
    if (!route) {
      return { error: 'ROUTE_NOT_FOUND' }
    }
    await DI.em.removeAndFlush(route)
    return true
  }

  async getAvailableClients(): Promise<CobranzaClient[]> {
    return DI.cobranzaClients.find({ isActive: true }, { populate: ['category'], orderBy: { name: 'ASC' } })
  }
}

export const cobranzaRouteService = new CobranzaRouteService()

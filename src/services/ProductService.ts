
import { DI } from '../di'
import { ProductTransaction, ProductTransactionType, TransactionStatus } from '../entities/ProductTransaction'
import { Product } from '../entities/Product'
import { ProductPresentation } from '../entities/ProductPresentation'
import { User } from '../entities/User'
import { wrap } from '@mikro-orm/core'

class ProductService {
    async getAllProducts(includeInactive = false) {
        const where = includeInactive ? {} : { isActive: true }
        return await DI.products.findAll({ where, orderBy: { name: 'ASC' }, populate: ['presentations'] })
    }

    async getStoreProducts() {
        return await DI.products.findAll({
            where: { isActive: true, showInStore: true },
            orderBy: { name: 'ASC' },
            populate: ['presentations']
        })
    }

    async getProduct(id: string) {
        return await DI.products.findOne({ id }, { populate: ['presentations'] })
    }

    async createProduct(data: {
        name: string
        sku?: string
        description?: string
        costPrice: number
        sellingPrice: number
        minStock?: number
        stock?: number
        imageUrl?: string
        userId?: string
        presentations?: { name: string; quantity: number; sellingPrice: number; showInStore?: boolean }[]
    }) {
        const { userId, presentations: presentationsData, ...productData } = data
        const em = DI.orm.em.fork()
        let product: Product

        await em.transactional(async (tem) => {
            product = new Product()
            wrap(product).assign({
                ...productData,
                stock: data.stock ?? 0,
                isActive: true
            })

            if (presentationsData) {
                for (const pp of presentationsData) {
                    const presentation = new ProductPresentation()
                    presentation.name = pp.name
                    presentation.quantity = pp.quantity
                    presentation.sellingPrice = pp.sellingPrice
                    presentation.showInStore = pp.showInStore ?? true
                    presentation.product = product
                    product.presentations.add(presentation)
                }
            }

            tem.persist(product)

            if (data.stock && data.stock > 0 && data.userId) {
                const user = await tem.findOne(User, { id: data.userId })
                if (user) {
                    const transaction = tem.create(ProductTransaction, {
                        product,
                        type: ProductTransactionType.ADJUSTMENT,
                        status: TransactionStatus.COMPLETED,
                        quantity: data.stock,
                        remainingQuantity: data.stock,
                        pricePerUnit: data.costPrice,
                        totalPrice: data.stock * data.costPrice,
                        createdBy: user,
                        createdAt: new Date()
                    } as any)
                    tem.persist(transaction)
                }
            }
        })

        return product!
    }

    async updateProduct(id: string, data: {
        name?: string
        sku?: string
        description?: string
        costPrice?: number
        sellingPrice?: number
        minStock?: number
        imageUrl?: string
        isActive?: boolean
        presentations?: { id?: string; name: string; quantity: number; sellingPrice: number; showInStore?: boolean }[]
    }) {
        const product = await this.getProduct(id)
        if (!product) throw new Error('Product not found')

        const { presentations: presentationsData, ...productData } = data

        wrap(product).assign(productData)

        if (presentationsData) {
            const incomingIds = new Set(presentationsData.filter(p => p.id).map(p => p.id!))

            for (const existing of product.presentations.getItems()) {
                if (!incomingIds.has(existing.id)) {
                    product.presentations.remove(existing)
                }
            }

            for (const pp of presentationsData) {
                if (pp.id) {
                    const existing = product.presentations.getItems().find(p => p.id === pp.id)
                    if (existing) {
                        existing.name = pp.name
                        existing.quantity = pp.quantity
                        existing.sellingPrice = pp.sellingPrice
                        if (pp.showInStore !== undefined) existing.showInStore = pp.showInStore
                    }
                } else {
                    const presentation = new ProductPresentation()
                    presentation.name = pp.name
                    presentation.quantity = pp.quantity
                    presentation.sellingPrice = pp.sellingPrice
                    presentation.showInStore = pp.showInStore ?? true
                    presentation.product = product
                    product.presentations.add(presentation)
                }
            }
        }

        await DI.orm.em.flush()
        return product
    }

    async deleteProduct(id: string) {
        const product = await this.getProduct(id)
        if (!product) throw new Error('Product not found')

        const count = await DI.productTransactions.count({ product })
        if (count > 0) {
            product.isActive = false
            await DI.orm.em.flush()
            return { message: 'Product deactivated (has history)' }
        }

        await DI.orm.em.removeAndFlush(product)
        return { message: 'Product deleted' }
    }
}

export const productService = new ProductService()

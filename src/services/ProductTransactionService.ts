
import { DI } from '../di'
import { Product } from '../entities/Product'
import { ProductPresentation } from '../entities/ProductPresentation'
import { ProductTransaction, ProductTransactionType, PaymentMethod, TransactionStatus } from '../entities/ProductTransaction'
import { User, UserRole } from '../entities/User'
import { wrap, LockMode } from '@mikro-orm/core'

class ProductTransactionService {

    async createPurchase(data: {
        productId: string
        quantity: number
        costPrice?: number
        userId: string
    }) {
        if (data.quantity <= 0) throw new Error('Quantity must be positive')

        const em = DI.orm.em.fork()

        await em.transactional(async (tem) => {
            const product = await tem.findOne(Product, { id: data.productId }, { lockMode: LockMode.PESSIMISTIC_WRITE })
            if (!product) throw new Error('Product not found')

            const user = await tem.findOne(User, { id: data.userId })
            if (!user) throw new Error('User not found')

            const isSuperAdmin = user.role === UserRole.SUPER_ADMIN
            const isPending = !isSuperAdmin

            const finalCostPrice = isPending ? product.costPrice : (data.costPrice ?? product.costPrice)

            if (finalCostPrice < 0) throw new Error('Cost price cannot be negative')

            const transaction = tem.create(ProductTransaction, {
                product,
                type: ProductTransactionType.PURCHASE,
                status: isPending ? TransactionStatus.PENDING : TransactionStatus.COMPLETED,
                quantity: data.quantity,
                remainingQuantity: data.quantity,
                pricePerUnit: finalCostPrice,
                totalPrice: data.quantity * finalCostPrice,
                createdBy: user,
                profit: 0,
                createdAt: new Date()
            })

            if (!isPending) {
                product.costPrice = finalCostPrice
            }

            product.stock += data.quantity

            tem.persist(transaction)
        })

        return { success: true }
    }

    async resolvePendingPurchase(transactionId: string, actualCostPrice: number) {
        if (actualCostPrice < 0) throw new Error('Cost price cannot be negative')

        const em = DI.orm.em.fork()
        await em.transactional(async (tem) => {
            const transaction = await tem.findOne(ProductTransaction, { id: transactionId }, { populate: ['product'] })
            if (!transaction) throw new Error('Transaction not found')
            if (transaction.status === TransactionStatus.COMPLETED) throw new Error('Transaction is already completed')
            if (transaction.type !== ProductTransactionType.PURCHASE) throw new Error('Only purchases can be resolved this way')

            const product = transaction.product

            transaction.pricePerUnit = actualCostPrice
            transaction.totalPrice = transaction.quantity * actualCostPrice
            transaction.status = TransactionStatus.COMPLETED

            product.costPrice = actualCostPrice

            tem.persist(transaction)
            tem.persist(product)
        })

        return { success: true }
    }

    async getPendingPurchases() {
        return await DI.productTransactions.find(
            { type: ProductTransactionType.PURCHASE, status: TransactionStatus.PENDING },
            { populate: ['product', 'createdBy'], orderBy: { createdAt: 'DESC' } }
        )
    }

    async createSale(data: {
        productId: string
        quantity: number
        presentationId?: string
        sellingPrice?: number
        paymentMethod?: PaymentMethod
        clientName?: string
        userId: string
    }) {
        const em = DI.orm.em.fork()
        return await em.transactional(async (tem) => {
            await this._processSale(tem, {
                productId: data.productId,
                quantity: data.quantity,
                presentationId: data.presentationId,
                sellingPrice: data.sellingPrice,
                paymentMethod: data.paymentMethod,
                clientName: data.clientName,
                userId: data.userId
            })
        })
    }

    async createBulkSale(data: {
        items: { productId: string; quantity: number; presentationId?: string; sellingPrice?: number }[]
        paymentMethod?: PaymentMethod
        clientName?: string
        userId: string
    }) {
        if (!data.items || data.items.length === 0) throw new Error('No items to sell')
        const em = DI.orm.em.fork()

        return await em.transactional(async (tem) => {
            for (const item of data.items) {
                await this._processSale(tem, {
                    productId: item.productId,
                    quantity: item.quantity,
                    presentationId: item.presentationId,
                    sellingPrice: item.sellingPrice,
                    paymentMethod: data.paymentMethod,
                    clientName: data.clientName,
                    userId: data.userId
                })
            }
        })
    }

    private async _processSale(tem: any, data: {
        productId: string
        quantity: number
        presentationId?: string
        sellingPrice?: number
        paymentMethod?: PaymentMethod
        clientName?: string
        userId: string
    }) {
        if (data.quantity <= 0) throw new Error('Quantity must be positive')

        const product = await tem.findOne(Product, { id: data.productId }, { lockMode: LockMode.PESSIMISTIC_WRITE })
        if (!product) throw new Error('Product not found')

        const user = await tem.findOne(User, { id: data.userId })
        if (!user) throw new Error('User not found')

        let effectiveQuantity = data.quantity
        let finalSellingPrice = data.sellingPrice
        let presentationId: string | undefined = data.presentationId
        let presentationName: string | undefined

        if (data.presentationId) {
            const presentation = await tem.findOne(ProductPresentation, { id: data.presentationId })
            if (!presentation) throw new Error('Presentation not found')
            effectiveQuantity = data.quantity * presentation.quantity
            presentationName = presentation.name
            if (!finalSellingPrice) {
                finalSellingPrice = Number(presentation.sellingPrice)
            }
        }

        if (product.stock < effectiveQuantity) {
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, needed: ${effectiveQuantity}`)
        }

        finalSellingPrice = finalSellingPrice ?? Number(product.sellingPrice)

        let quantityToSell = effectiveQuantity
        let totalCost = 0

        const batches = await tem.find(ProductTransaction, {
            product: product,
            type: { $in: [ProductTransactionType.PURCHASE, ProductTransactionType.ADJUSTMENT] },
            remainingQuantity: { $gt: 0 }
        }, {
            orderBy: { createdAt: 'ASC' }
        })

        for (const batch of batches) {
            if (quantityToSell <= 0) break

            const quantityFromBatch = Math.min(batch.remainingQuantity, quantityToSell)

            totalCost += quantityFromBatch * Number(batch.pricePerUnit)

            batch.remainingQuantity -= quantityFromBatch
            quantityToSell -= quantityFromBatch
        }

        if (quantityToSell > 0) {
            totalCost += quantityToSell * Number(product.costPrice)
        }

        const totalRevenue = effectiveQuantity * finalSellingPrice
        const profit = totalRevenue - totalCost

        const transaction = tem.create(ProductTransaction, {
            product,
            type: ProductTransactionType.SALE,
            status: TransactionStatus.COMPLETED,
            quantity: effectiveQuantity,
            remainingQuantity: 0,
            pricePerUnit: finalSellingPrice,
            totalPrice: totalRevenue,
            profit: profit,
            paymentMethod: data.paymentMethod ?? PaymentMethod.CASH,
            clientName: data.clientName,
            presentationId: presentationId,
            presentationName: presentationName,
            createdAt: new Date(),
            createdBy: user
        })

        product.stock -= effectiveQuantity

        tem.persist(transaction)
    }

    async createAdjustment(data: {
        productId: string
        quantity: number
        reason?: string
        userId: string
    }) {
        const em = DI.orm.em.fork()
        await em.transactional(async (tem) => {
            const product = await tem.findOne(Product, { id: data.productId })
            if (!product) throw new Error('Product not found')

            const user = await tem.findOne(User, { id: data.userId })
            if (!user) throw new Error('User not found')

            const isAddition = data.quantity > 0
            const absQuantity = Math.abs(data.quantity)

            const transaction = tem.create(ProductTransaction, {
                product,
                type: ProductTransactionType.ADJUSTMENT,
                status: TransactionStatus.COMPLETED,
                quantity: absQuantity,
                remainingQuantity: isAddition ? absQuantity : 0,
                pricePerUnit: isAddition ? product.costPrice : 0,
                totalPrice: 0,
                createdBy: user,
                createdAt: new Date()
            })

            if (isAddition) {
                product.stock += absQuantity
            } else {
                if (product.stock < absQuantity) throw new Error('Cannot reduce stock below 0')

                let qtyToRemove = absQuantity
                const batches = await tem.find(ProductTransaction, {
                    product: product,
                    type: { $in: [ProductTransactionType.PURCHASE, ProductTransactionType.ADJUSTMENT] },
                    remainingQuantity: { $gt: 0 }
                }, {
                    orderBy: { createdAt: 'ASC' }
                })

                for (const batch of batches) {
                    if (qtyToRemove <= 0) break
                    const remove = Math.min(batch.remainingQuantity, qtyToRemove)
                    batch.remainingQuantity -= remove
                    qtyToRemove -= remove
                }

                product.stock -= absQuantity
            }

            tem.persist(transaction)
        })
    }

    async getTransactions(productId?: string, startDate?: Date, endDate?: Date) {
        const where: any = {}
        if (productId) where.product = { id: productId }

        if (startDate || endDate) {
            where.createdAt = {}
            if (startDate) where.createdAt.$gte = startDate
            if (endDate) where.createdAt.$lte = endDate

        }

        return await DI.productTransactions.find(where, {
            orderBy: { createdAt: 'DESC' },
            populate: ['product', 'createdBy']
        })
    }
}

export const productTransactionService = new ProductTransactionService()

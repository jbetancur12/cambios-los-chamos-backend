
import { DI } from '../di';
import { Product } from '../entities/Product';
import { ProductTransaction, ProductTransactionType, PaymentMethod } from '../entities/ProductTransaction';
import { User } from '../entities/User';
import { wrap, LockMode } from '@mikro-orm/core';

class ProductTransactionService {

    async createPurchase(data: {
        productId: string;
        quantity: number;
        costPrice: number; // Purchase price
        userId: string;
    }) {
        // Basic validation
        if (data.quantity <= 0) throw new Error('Quantity must be positive');
        if (data.costPrice < 0) throw new Error('Cost price cannot be negative');

        const em = DI.orm.em.fork(); // Use fork for atomic transaction logic if needed

        await em.transactional(async (tem) => {
            const product = await tem.findOne(Product, { id: data.productId });
            if (!product) throw new Error('Product not found');

            const user = await tem.findOne(User, { id: data.userId });
            if (!user) throw new Error('User not found');

            // Create Transaction
            const transaction = tem.create(ProductTransaction, {
                product,
                type: ProductTransactionType.PURCHASE,
                quantity: data.quantity,
                remainingQuantity: data.quantity, // Initialize FIFO tracking
                pricePerUnit: data.costPrice,
                totalPrice: data.quantity * data.costPrice,
                createdBy: user,
                profit: 0, // Purchases have no profit
                createdAt: new Date()
            });

            // Update Product Cost Price (Standard Weighted Average would be better, but staying with Last Price for display)
            // Ideally, the "Cost Price" on the product view becomes "Replacement Cost" or "Last Purchase Cost"
            product.costPrice = data.costPrice;
            product.stock += data.quantity;

            // Persist
            tem.persist(transaction);
        });

        return { success: true };
    }

    async createSale(data: {
        productId: string;
        quantity: number;
        sellingPrice?: number;
        paymentMethod?: PaymentMethod;
        userId: string;
    }) {
        const em = DI.orm.em.fork();
        return await em.transactional(async (tem) => {
            await this._processSale(tem, {
                productId: data.productId,
                quantity: data.quantity,
                sellingPrice: data.sellingPrice,
                paymentMethod: data.paymentMethod,
                userId: data.userId
            });
        });
    }

    async createBulkSale(data: {
        items: { productId: string; quantity: number; sellingPrice?: number }[];
        paymentMethod?: PaymentMethod;
        userId: string;
    }) {
        if (!data.items || data.items.length === 0) throw new Error('No items to sell');
        const em = DI.orm.em.fork();

        return await em.transactional(async (tem) => {
            for (const item of data.items) {
                await this._processSale(tem, {
                    productId: item.productId,
                    quantity: item.quantity,
                    sellingPrice: item.sellingPrice,
                    paymentMethod: data.paymentMethod,
                    userId: data.userId
                });
            }
        });
    }

    private async _processSale(tem: any, data: {
        productId: string;
        quantity: number;
        sellingPrice?: number;
        paymentMethod?: PaymentMethod;
        userId: string;
    }) {
        if (data.quantity <= 0) throw new Error('Quantity must be positive');

        const product = await tem.findOne(Product, { id: data.productId }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!product) throw new Error('Product not found');

        if (product.stock < data.quantity) {
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
        }

        const user = await tem.findOne(User, { id: data.userId });
        if (!user) throw new Error('User not found');

        const finalSellingPrice = data.sellingPrice ?? product.sellingPrice;

        // --- FIFO LOGIC ---
        let quantityToSell = data.quantity;
        let totalCost = 0;

        // 1. Fetch available stock batches (FIFO order: Oldest First)
        const batches = await tem.find(ProductTransaction, {
            product: product,
            type: { $in: [ProductTransactionType.PURCHASE, ProductTransactionType.ADJUSTMENT] },
            remainingQuantity: { $gt: 0 }
        }, {
            orderBy: { createdAt: 'ASC' }
        });

        // 2. Deplete batches
        for (const batch of batches) {
            if (quantityToSell <= 0) break;

            const quantityFromBatch = Math.min(batch.remainingQuantity, quantityToSell);

            // Cost for these units
            totalCost += quantityFromBatch * Number(batch.pricePerUnit);

            // Update batch
            batch.remainingQuantity -= quantityFromBatch;
            quantityToSell -= quantityFromBatch;
        }

        // 3. Handle Remaining Quantity (If we are selling more than we have tracked in batches)
        if (quantityToSell > 0) {
            totalCost += quantityToSell * Number(product.costPrice);
        }

        // Calculate Profit
        const totalRevenue = data.quantity * finalSellingPrice;
        const profit = totalRevenue - totalCost;

        const transaction = tem.create(ProductTransaction, {
            product,
            type: ProductTransactionType.SALE,
            quantity: data.quantity,
            remainingQuantity: 0,
            pricePerUnit: finalSellingPrice,
            totalPrice: totalRevenue,
            profit: profit,
            paymentMethod: data.paymentMethod ?? PaymentMethod.CASH, // Default to CASH
            createdBy: user,
            createdAt: new Date()
        });

        // Deduct Stock
        product.stock -= data.quantity;

        tem.persist(transaction);
    }

    async createAdjustment(data: {
        productId: string;
        quantity: number; // Positive adds stock, Negative removes stock
        reason?: string;
        userId: string;
    }) {
        const em = DI.orm.em.fork();
        await em.transactional(async (tem) => {
            const product = await tem.findOne(Product, { id: data.productId });
            if (!product) throw new Error('Product not found');

            const user = await tem.findOne(User, { id: data.userId });
            if (!user) throw new Error('User not found');

            const isAddition = data.quantity > 0;
            const absQuantity = Math.abs(data.quantity);

            const transaction = tem.create(ProductTransaction, {
                product,
                type: ProductTransactionType.ADJUSTMENT,
                quantity: absQuantity,
                remainingQuantity: isAddition ? absQuantity : 0, // Additions tracked, subtractions not
                pricePerUnit: isAddition ? product.costPrice : 0, // Additions valued at current cost
                totalPrice: 0,
                createdBy: user,
                createdAt: new Date()
            });

            if (isAddition) {
                product.stock += absQuantity;
            } else {
                // FIFIO Depletion for Negative Adjustment (Loss/Damage)
                if (product.stock < absQuantity) throw new Error('Cannot reduce stock below 0');

                let qtyToRemove = absQuantity;
                const batches = await tem.find(ProductTransaction, {
                    product: product,
                    type: { $in: [ProductTransactionType.PURCHASE, ProductTransactionType.ADJUSTMENT] },
                    remainingQuantity: { $gt: 0 }
                }, {
                    orderBy: { createdAt: 'ASC' }
                });

                for (const batch of batches) {
                    if (qtyToRemove <= 0) break;
                    const remove = Math.min(batch.remainingQuantity, qtyToRemove);
                    batch.remainingQuantity -= remove;
                    qtyToRemove -= remove;
                }

                product.stock -= absQuantity;
            }

            tem.persist(transaction);
        });
    }

    async getTransactions(productId?: string, startDate?: Date, endDate?: Date) {
        const where: any = {};
        if (productId) where.product = { id: productId };

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.$gte = startDate;
            if (endDate) {
                // Adjust end date to end of day if it's just a date, or use as provides
                // Usually reporting sends specific timestamps.
                where.createdAt.$lte = endDate;
            }
        }

        return await DI.productTransactions.find(where, {
            orderBy: { createdAt: 'DESC' },
            populate: ['product', 'createdBy']
        });
    }
}

export const productTransactionService = new ProductTransactionService();

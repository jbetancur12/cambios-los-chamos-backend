
import { DI } from '../di';
import { ProductTransaction, ProductTransactionType, TransactionStatus } from '../entities/ProductTransaction';
import { Product } from '../entities/Product';
import { User } from '../entities/User';
import { wrap } from '@mikro-orm/core';

class ProductService {
    async getAllProducts(includeInactive = false) {
        const where = includeInactive ? {} : { isActive: true };
        return await DI.products.findAll({ where, orderBy: { name: 'ASC' } });
    }

    async getProduct(id: string) {
        return await DI.products.findOne({ id });
    }

    async createProduct(data: {
        name: string;
        sku?: string;
        description?: string;
        costPrice: number;
        sellingPrice: number;
        minStock?: number;
        stock?: number;
        imageUrl?: string;
        userId?: string;
    }) {
        const { userId, ...productData } = data;
        const em = DI.orm.em.fork();
        let product: Product;
        
        await em.transactional(async (tem) => {
            product = new Product();
            wrap(product).assign({
                ...productData,
                stock: data.stock ?? 0,
                isActive: true
            });
            tem.persist(product);

            if (data.stock && data.stock > 0 && data.userId) {
                const user = await tem.findOne(User, { id: data.userId });
                if (user) {
                    const transaction = tem.create(ProductTransaction, {
                        product,
                        type: ProductTransactionType.ADJUSTMENT,
                        status: TransactionStatus.COMPLETED,
                        quantity: data.stock,
                        remainingQuantity: data.stock, // First FIFO batch!
                        pricePerUnit: data.costPrice,
                        totalPrice: data.stock * data.costPrice,
                        createdBy: user,
                        createdAt: new Date()
                    });
                    tem.persist(transaction);
                }
            }
        });

        return product!;
    }

    async updateProduct(id: string, data: {
        name?: string;
        sku?: string;
        description?: string;
        costPrice?: number;
        sellingPrice?: number;
        minStock?: number;
        imageUrl?: string;
        isActive?: boolean;
    }) {
        const product = await this.getProduct(id);
        if (!product) throw new Error('Product not found');

        wrap(product).assign(data);
        await DI.orm.em.flush();
        return product;
    }

    async deleteProduct(id: string) {
        const product = await this.getProduct(id);
        if (!product) throw new Error('Product not found');

        // Check if it has transactions
        const count = await DI.productTransactions.count({ product });
        if (count > 0) {
            // Soft delete if used
            product.isActive = false;
            await DI.orm.em.flush();
            return { message: 'Product deactivated (has history)' };
        }

        await DI.orm.em.removeAndFlush(product);
        return { message: 'Product deleted' };
    }
}

export const productService = new ProductService();


import { DI } from '../di';
import { Product } from '../entities/Product';
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
        imageUrl?: string;
    }) {
        const product = new Product();
        wrap(product).assign({
            ...data,
            stock: 0,
            isActive: true
        });

        await DI.orm.em.persistAndFlush(product);
        return product;
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

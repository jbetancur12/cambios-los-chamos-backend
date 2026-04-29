import { MikroORM } from '@mikro-orm/postgresql';
import config from './src/mikro-orm.config';
import { Product } from './src/entities/Product';
import { ProductTransaction, ProductTransactionType, TransactionStatus } from './src/entities/ProductTransaction';
import { User, UserRole } from './src/entities/User';

async function main() {
    console.log("Iniciando script de corrección de minStock a stock...");
    const orm = await MikroORM.init(config);
    const em = orm.em.fork();

    const superAdmin = await em.findOne(User, { role: UserRole.SUPER_ADMIN });
    if (!superAdmin) {
        console.error("Error: Usuario SUPER_ADMIN no encontrado. No se puede asignar responsable de la corrección.");
        process.exit(1);
    }

    const products = await em.find(Product, {});
    let fixedCount = 0;

    for (const p of products) {
        // Asumimos que si minStock no es 5 (el nuevo por defecto), probablemente el cliente metió el stock ahí por error
        // O si el cliente explícitamente pide pasar el minStock a stock y dejar minStock en 5.
        // Vamos a verificar si su minStock era lo que ellos pensaban que era el stock inicial.
        
        // Solo modificamos si minStock > 0
        if (p.minStock > 0) {
            const quantityToMove = p.minStock;
            
            // 1. Movemos la cantidad al stock real
            p.stock += quantityToMove;
            
            // 2. Establecemos el minStock global en 5 como acordamos
            p.minStock = 5;

            // 3. Creamos la transacción inicial (ADJUSTMENT) para esta cantidad, 
            // asegurando que entre como Lote FIFO con el costo de compra actual.
            const transaction = em.create(ProductTransaction, {
                product: p,
                type: ProductTransactionType.ADJUSTMENT,
                status: TransactionStatus.COMPLETED,
                quantity: quantityToMove,
                remainingQuantity: quantityToMove, // Este es el Lote 1 oficial para estas unidades
                pricePerUnit: p.costPrice,
                totalPrice: quantityToMove * p.costPrice,
                createdBy: superAdmin,
                createdAt: p.createdAt // Le ponemos la misma fecha de creación del producto
            });
            em.persist(transaction);
            
            fixedCount++;
            console.log(`- Producto [${p.name}]: movidas ${quantityToMove} unidades al stock real y minStock ajustado a 5.`);
        } else {
            // Si por alguna razón el minStock era 0, igual lo estandarizamos a 5
            if (p.minStock !== 5) {
                p.minStock = 5;
                console.log(`- Producto [${p.name}]: minStock actualizado a 5.`);
            }
        }
    }

    await em.flush();
    console.log(`\n¡Corrección finalizada exitosamente! Se corrigieron ${fixedCount} productos.`);
    await orm.close();
}

main().catch((err) => {
    console.error("Error ejecutando el script:", err);
    process.exit(1);
});

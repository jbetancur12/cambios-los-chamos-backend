import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { Product } from '@/entities/Product'
import { ProductPresentation } from '@/entities/ProductPresentation'
import { ProductTransaction, ProductTransactionType, PaymentMethod, TransactionStatus } from '@/entities/ProductTransaction'
import { User, UserRole } from '@/entities/User'

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(randomInt(8, 18), randomInt(0, 59), randomInt(0, 59), 0)
  return d
}

const PRODUCTS_DATA = [
  { name: 'Harina PAN 1kg', sku: 'HP-001', costPrice: 4500, sellingPrice: 7500, minStock: 10, stock: 50 },
  { name: 'Aceite Maíz 1L', sku: 'AM-001', costPrice: 8000, sellingPrice: 13500, minStock: 5, stock: 30 },
  { name: 'Arroz 1kg', sku: 'AR-001', costPrice: 3200, sellingPrice: 5800, minStock: 20, stock: 100 },
  { name: 'Café La Florida 500g', sku: 'CF-001', costPrice: 6500, sellingPrice: 11000, minStock: 5, stock: 25 },
  { name: 'Leche Klim 800g', sku: 'LK-001', costPrice: 9000, sellingPrice: 15500, minStock: 5, stock: 20 },
  { name: 'Queso Guayanés 500g', sku: 'QG-001', costPrice: 7000, sellingPrice: 12000, minStock: 3, stock: 15 },
  { name: 'Pasta Capri 500g', sku: 'PC-001', costPrice: 2500, sellingPrice: 4500, minStock: 15, stock: 80 },
  { name: 'Azúcar 1kg', sku: 'AZ-001', costPrice: 2800, sellingPrice: 5000, minStock: 15, stock: 60 },
  { name: 'Caraotas Negras 500g', sku: 'CN-001', costPrice: 3000, sellingPrice: 5500, minStock: 10, stock: 45 },
  { name: 'Atún Enlatado 170g', sku: 'AE-001', costPrice: 4000, sellingPrice: 7000, minStock: 8, stock: 40 },
  { name: 'Mayonesa Mavesa 500g', sku: 'MM-001', costPrice: 5500, sellingPrice: 9500, minStock: 5, stock: 25 },
  { name: 'Jabón de Baño 100g', sku: 'JB-001', costPrice: 2000, sellingPrice: 3800, minStock: 10, stock: 60 },
  { name: 'Detergente 1kg', sku: 'DT-001', costPrice: 6000, sellingPrice: 10500, minStock: 5, stock: 30 },
  { name: 'Malta Regional 355ml', sku: 'MR-001', costPrice: 3500, sellingPrice: 6000, minStock: 12, stock: 48 },
  { name: 'Cloro 1L', sku: 'CL-001', costPrice: 1800, sellingPrice: 3500, minStock: 10, stock: 50 },
]

const PRESENTATIONS_DATA: Record<string, { name: string; quantity: number; sellingPrice: number }[]> = {
  'Harina PAN 1kg': [
    { name: 'Unidad', quantity: 1, sellingPrice: 7500 },
    { name: 'Docena', quantity: 12, sellingPrice: 82000 },
  ],
  'Aceite Maíz 1L': [
    { name: 'Unidad', quantity: 1, sellingPrice: 13500 },
    { name: 'Caja x12', quantity: 12, sellingPrice: 145000 },
  ],
  'Arroz 1kg': [
    { name: 'Unidad', quantity: 1, sellingPrice: 5800 },
    { name: 'Bolsa x10', quantity: 10, sellingPrice: 52000 },
  ],
  'Café La Florida 500g': [
    { name: 'Unidad', quantity: 1, sellingPrice: 11000 },
    { name: 'Caja x6', quantity: 6, sellingPrice: 60000 },
  ],
  'Pasta Capri 500g': [
    { name: 'Unidad', quantity: 1, sellingPrice: 4500 },
    { name: 'Paquete x20', quantity: 20, sellingPrice: 80000 },
  ],
}

const PAYMENT_METHODS: PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.CARD, PaymentMethod.CREDIT]

export class ProductSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const admin = await em.findOne(User, { role: UserRole.SUPER_ADMIN })
    if (!admin) throw new Error('No SUPER_ADMIN found. Run create:superadmin first.')

    const products: Product[] = []

    for (const data of PRODUCTS_DATA) {
      const product = new Product()
      product.name = data.name
      product.sku = data.sku
      product.costPrice = data.costPrice
      product.sellingPrice = data.sellingPrice
      product.minStock = data.minStock
      product.stock = data.stock
      product.isActive = true
      product.showInStore = true

      const presData = PRESENTATIONS_DATA[data.name]
      if (presData) {
        for (const pp of presData) {
          const pres = new ProductPresentation()
          pres.product = product
          pres.name = pp.name
          pres.quantity = pp.quantity
          pres.sellingPrice = pp.sellingPrice
          pres.showInStore = true
          product.presentations.add(pres)
        }
      }

      em.persist(product)
      products.push(product)
    }

    await em.flush()

    // Purchase transactions (initial stock)
    for (const product of products) {
      const origData = PRODUCTS_DATA.find((p) => p.name === product.name)
      if (!origData) continue

      const purchase = new ProductTransaction()
      purchase.product = product
      purchase.type = ProductTransactionType.PURCHASE
      purchase.status = TransactionStatus.COMPLETED
      purchase.quantity = origData.stock
      purchase.pricePerUnit = origData.costPrice
      purchase.totalPrice = origData.stock * origData.costPrice
      purchase.createdBy = admin
      purchase.createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      em.persist(purchase)
    }

    // Sales in the last 7 days
    const paymentWeights = [
      { method: PaymentMethod.CASH, weight: 40 },
      { method: PaymentMethod.TRANSFER, weight: 30 },
      { method: PaymentMethod.CARD, weight: 20 },
      { method: PaymentMethod.CREDIT, weight: 10 },
    ]
    const totalWeight = paymentWeights.reduce((s, p) => s + p.weight, 0)

    for (let day = 0; day < 7; day++) {
      const salesCount = randomInt(8, 18)

      for (let i = 0; i < salesCount; i++) {
        const product = products[randomInt(0, products.length - 1)]
        const origData = PRODUCTS_DATA.find((p) => p.name === product.name)
        if (!origData) continue

        const quantity = randomInt(1, 5)
        const pricePerUnit = origData.sellingPrice
        const totalPrice = quantity * pricePerUnit
        const profit = totalPrice - quantity * origData.costPrice

        let roll = randomInt(1, totalWeight)
        let paymentMethod = PAYMENT_METHODS[0]
        for (const p of paymentWeights) {
          if (roll <= p.weight) {
            paymentMethod = p.method
            break
          }
          roll -= p.weight
        }

        const sale = new ProductTransaction()
        sale.product = product
        sale.type = ProductTransactionType.SALE
        sale.status = TransactionStatus.COMPLETED
        sale.paymentMethod = paymentMethod
        sale.quantity = quantity
        sale.pricePerUnit = pricePerUnit
        sale.totalPrice = totalPrice
        sale.profit = profit
        sale.createdBy = admin
        sale.createdAt = randomDate(day)
        em.persist(sale)
      }
    }

    await em.flush()
  }
}

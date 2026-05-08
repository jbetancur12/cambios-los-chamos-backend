import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { productService } from '../services/ProductService';
import { productTransactionService } from '../services/ProductTransactionService';
import { ApiResponse } from '@/lib/apiResponse';
import { requireAuth, requireRole } from '@/middleware/authMiddleware';
import { UserRole } from '@/entities/User';
import { Product } from '@/entities/Product';
import { DI } from '@/di';
import { minioService } from '@/services/MinIOService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Formato no permitido. Solo: JPG, PNG, GIF, WebP'))
  },
})

const PRODUCT_BUCKET = 'store'

// --- PUBLIC ENDPOINTS (no auth) ---

router.get('/products/public', async (_req, res) => {
    try {
        const products = await productService.getStoreProducts()
        const mapped = products
            .map((p) => {
                const allPresentations = p.presentations.getItems()
                const visiblePresentations = allPresentations.filter((pp) => pp.showInStore)
                const hasAnyPresentation = allPresentations.length > 0
                if (hasAnyPresentation && visiblePresentations.length === 0) return null
                return {
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    sellingPrice: p.sellingPrice,
                    stock: p.stock,
                    imageUrl: p.imageUrl ? `/inventory/products/${p.id}/image` : undefined,
                    presentations: visiblePresentations.map((pp) => ({
                        id: pp.id,
                        name: pp.name,
                        quantity: pp.quantity,
                        sellingPrice: Number(pp.sellingPrice),
                    })),
                }
            })
            .filter(Boolean)
        res.json(ApiResponse.success(mapped))
    } catch (error: any) {
        res.status(500).json(ApiResponse.serverError(error.message))
    }
})

router.get('/products/:id/image', async (req, res) => {
    try {
        const product = await productService.getProduct(req.params.id)
        if (!product || !product.imageUrl) {
            return res.status(404).json(ApiResponse.notFound('Imagen no encontrada'))
        }
        const buffer = await minioService.getFileAsBuffer(PRODUCT_BUCKET, product.imageUrl)
        const ext = path.extname(product.imageUrl).toLowerCase()
        const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }
        res.set('Content-Type', mimeMap[ext] || 'image/jpeg')
        res.set('Cache-Control', 'public, max-age=86400')
        res.send(buffer)
    } catch (error: any) {
        res.status(404).json(ApiResponse.notFound('Imagen no encontrada'))
    }
})

// Apply auth and role middleware to all other inventory routes
router.use(requireAuth());
router.use(requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

// --- PRODUCTS ---

router.get('/products', async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        const products = await productService.getAllProducts(includeInactive);
        res.json(ApiResponse.success(products));
    } catch (error: any) {
        res.status(500).json(ApiResponse.serverError(error.message));
    }
});

router.get('/products/:id', async (req, res) => {
    try {
        const product = await productService.getProduct(req.params.id);
        if (!product) return res.status(404).json(ApiResponse.notFound('Product not found'));
        res.json(ApiResponse.success(product));
    } catch (error: any) {
        res.status(500).json(ApiResponse.serverError(error.message));
    }
});

router.post('/products', requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
    try {
        const userId = req.context?.requestUser?.user?.id;
        const product = await productService.createProduct({
            ...req.body,
            userId
        });
        res.status(201).json(ApiResponse.success(product));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

router.put('/products/:id', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
    try {
        const product = await productService.updateProduct(req.params.id, req.body);
        res.json(ApiResponse.success(product));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

router.delete('/products/:id', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
    try {
        const result = await productService.deleteProduct(req.params.id);
        res.json(ApiResponse.success(result));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

// --- PRODUCT IMAGE UPLOAD ---

router.post('/products/:id/upload-image', requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), upload.single('image'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json(ApiResponse.badRequest('No se envió ninguna imagen'));

        const validation = minioService.validateFile(file.buffer, file.mimetype);
        if (!validation.valid) return res.status(400).json(ApiResponse.badRequest(validation.error!));

        // Fork EM to avoid global context issues with multer
        const em = DI.em.fork()

        const product = await em.findOne(Product, { id: req.params.id })
        if (!product) return res.status(404).json(ApiResponse.notFound('Producto no encontrado'))

        const processed = await minioService.processImage(file.buffer, file.mimetype, {
            userId: req.context?.requestUser?.user?.id || 'unknown',
            fullName: req.context?.requestUser?.user?.fullName || 'Unknown',
        });

        const ext = path.extname(file.originalname) || '.jpg';
        const baseFilename = `product-${product.id}${ext}`;
        const { key } = await minioService.uploadProcessedFile(PRODUCT_BUCKET, baseFilename, processed, file.mimetype);

        // Delete old image if exists
        if (product.imageUrl) {
            await minioService.deleteFile(PRODUCT_BUCKET, product.imageUrl).catch(() => {});
        }

        product.imageUrl = key
        await em.flush()

        res.json(ApiResponse.success({ imageUrl: `/inventory/products/${product.id}/image` }));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
})

// --- TRANSACTIONS ---

router.get('/transactions', async (req, res) => {
    try {
        const productId = req.query.productId as string;
        const startDateStr = req.query.startDate as string;
        const endDateStr = req.query.endDate as string;

        const startDate = startDateStr ? new Date(startDateStr) : undefined;
        const endDate = endDateStr ? new Date(endDateStr) : undefined;

        const transactions = await productTransactionService.getTransactions(productId, startDate, endDate);
        res.json(ApiResponse.success(transactions));
    } catch (error: any) {
        res.status(500).json(ApiResponse.serverError(error.message));
    }
});

router.post('/transactions/purchase', async (req, res) => {
    try {
        // Assuming auth middleware populates req.context.requestUser.user
        const userId = req.context?.requestUser?.user?.id;
        if (!userId) return res.status(401).json(ApiResponse.unauthorized());

        await productTransactionService.createPurchase({ ...req.body, userId });
        res.status(201).json(ApiResponse.success({ success: true }));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

router.get('/transactions/purchase/pending', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
    try {
        const pending = await productTransactionService.getPendingPurchases();
        res.json(ApiResponse.success(pending));
    } catch (error: any) {
        res.status(500).json(ApiResponse.serverError(error.message));
    }
});

router.put('/transactions/purchase/:id/resolve', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
    try {
        await productTransactionService.resolvePendingPurchase(req.params.id, req.body.costPrice);
        res.json(ApiResponse.success({ success: true }));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

router.post('/transactions/sale', async (req, res) => {
    try {
        const userId = req.context?.requestUser?.user?.id;
        if (!userId) return res.status(401).json(ApiResponse.unauthorized());

        await productTransactionService.createSale({ ...req.body, userId });
        res.status(201).json(ApiResponse.success({ success: true }));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

router.post('/transactions/bulk-sale', async (req, res) => {
    try {
        const userId = req.context?.requestUser?.user?.id;
        if (!userId) return res.status(401).json(ApiResponse.unauthorized());

        await productTransactionService.createBulkSale({
            items: req.body.items,
            paymentMethod: req.body.paymentMethod,
            clientName: req.body.clientName,
            userId
        });
        res.status(201).json(ApiResponse.success({ success: true }));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

// Manual Adjustment
router.post('/transactions/adjustment', requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
    try {
        const userId = req.context?.requestUser?.user?.id;
        if (!userId) return res.status(401).json(ApiResponse.unauthorized());

        await productTransactionService.createAdjustment({ ...req.body, userId });
        res.status(201).json(ApiResponse.success({ success: true }));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

export const inventoryRouter = router;

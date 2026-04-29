import { Router } from 'express';
import { productService } from '../services/ProductService';
import { productTransactionService } from '../services/ProductTransactionService';
import { ApiResponse } from '@/lib/apiResponse';
import { requireAuth, requireRole } from '@/middleware/authMiddleware';
import { UserRole } from '@/entities/User';

const router = Router();

// Apply auth and role middleware to all inventory routes
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

router.post('/products', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
    try {
        const product = await productService.createProduct(req.body);
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
            paymentMethod: req.body.paymentMethod, // Extract paymentMethod
            userId
        });
        res.status(201).json(ApiResponse.success({ success: true }));
    } catch (error: any) {
        res.status(400).json(ApiResponse.badRequest(error.message));
    }
});

// Manual Adjustment
router.post('/transactions/adjustment', requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
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

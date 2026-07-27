/**
 * The PUBLIC versioned API (`/v1/*`) — what external developers actually call with their
 * platform key or OAuth token. Every route runs through the gateway: authenticated,
 * version-resolved, quota-enforced, scope-checked, and metered.
 *
 * These endpoints mirror `PUBLIC_API_ENDPOINTS` in the core, which is also what generates
 * the OpenAPI document and the SDK plan — one registry, three consumers.
 */
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { apiGateway, requireEffect, requireScope } from '../../middleware/gateway.middleware.js';
import { ok, paginated, pageParams } from '../../utils/envelope.js';
import { Product } from '../../models/product.model.js';
import { Order } from '../../models/order.model.js';
import { Customer } from '../../models/customer.model.js';
import { StockLevel } from '../../models/stock-level.model.js';

const router = Router();
router.use(apiGateway);

/* -------------------------------- products ------------------------------- */
router.get('/products', requireScope('products:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const where = { organizationId: req.api.orgId, deletedAt: null };
  const [data, total] = await Promise.all([
    Product.find(where).skip(skip).limit(limit).lean(),
    Product.countDocuments(where),
  ]);
  paginated(res, data, { total, page, limit });
}));

router.get('/products/:id', requireScope('products:read'), asyncHandler(async (req, res) => {
  const p = await Product.findOne({ _id: req.params.id, organizationId: req.api.orgId, deletedAt: null }).lean();
  if (!p) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'Product not found' } });
  ok(res, p);
}));

/* --------------------------------- orders -------------------------------- */
router.get('/orders', requireScope('orders:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const where = { organizationId: req.api.orgId, deletedAt: null };
  if (req.query.status) where.status = req.query.status;
  const [data, total] = await Promise.all([
    Order.find(where).skip(skip).limit(limit).lean(),
    Order.countDocuments(where),
  ]);
  paginated(res, data, { total, page, limit });
}));

router.get('/orders/:id', requireScope('orders:read'), asyncHandler(async (req, res) => {
  const o = await Order.findOne({ _id: req.params.id, organizationId: req.api.orgId, deletedAt: null }).lean();
  if (!o) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'Order not found' } });
  ok(res, o);
}));

/* ------------------------------- inventory ------------------------------- */
router.get('/inventory', requireScope('inventory:read'), asyncHandler(async (req, res) => {
  const rows = await StockLevel.find({ organizationId: req.api.orgId }).populate('productId', 'sku title').lean();
  ok(res, rows.map((r) => ({ sku: r.productId?.sku, onHand: r.onHand, reserved: r.reserved, available: r.onHand - r.reserved })));
}));

/* -------------------------------- customers ------------------------------ */
router.get('/customers', requireScope('customers:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const where = { organizationId: req.api.orgId, deletedAt: null };
  const [data, total] = await Promise.all([
    Customer.find(where).skip(skip).limit(limit).lean(),
    Customer.countDocuments(where),
  ]);
  paginated(res, data, { total, page, limit });
}));

/* ---------------------- an external side effect (sandbox-blocked) -------- */
router.post('/shipments', requireScope('shipments:write'), requireEffect('external'), asyncHandler(async (_req, res) => {
  // Buying a real carrier label is an EXTERNAL side effect: a sandbox key is refused above.
  ok(res, { created: true, note: 'label purchased (live environment)' });
}));

export default router;

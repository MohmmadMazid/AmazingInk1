import { Order } from '../../models/order.model.js';
import { Product } from '../../models/product.model.js';
import { computeOrderTotals } from '../../core/pricing.js';
import { ApiError } from '../../utils/asyncHandler.js';

export async function list(orgId, { skip, limit, status }) {
  const where = { organizationId: orgId, deletedAt: null };
  if (status) where.status = status;
  const [data, total] = await Promise.all([
    Order.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(where),
  ]);
  return { data, total };
}

export async function get(orgId, id) {
  const order = await Order.findOne({ _id: id, organizationId: orgId, deletedAt: null });
  if (!order) throw new ApiError(404, 'Order not found', 'not_found');
  return order;
}

/** Build lines from product ids, pricing each from the current product price, then compute totals. */
export async function create(orgId, { customerId, channel, lines }) {
  if (!lines?.length) throw new ApiError(400, 'Order requires at least one line', 'validation');
  const products = await Product.find({ _id: { $in: lines.map((l) => l.productId) }, organizationId: orgId, deletedAt: null });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  let currency = null;
  const built = lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p) throw new ApiError(400, `Unknown product ${l.productId}`, 'validation');
    currency ??= p.price.currency;
    if (p.price.currency !== currency) throw new ApiError(400, 'All lines must share one currency', 'validation');
    return { productId: p._id, sku: p.sku, quantity: l.quantity, unitPriceMinor: p.price.amountMinor, lineTotalMinor: p.price.amountMinor * l.quantity };
  });

  const totals = computeOrderTotals(built);
  return Order.create({
    organizationId: orgId,
    orderNumber: `SO-${Date.now().toString().slice(-8)}`,
    customerId, channel, currency, lines: built, ...totals,
  });
}

export async function setStatus(orgId, id, status) {
  const order = await Order.findOneAndUpdate(
    { _id: id, organizationId: orgId, deletedAt: null },
    { $set: { status } },
    { new: true },
  );
  if (!order) throw new ApiError(404, 'Order not found', 'not_found');
  return order;
}

import { Product } from '../../models/product.model.js';
import { ApiError } from '../../utils/asyncHandler.js';

/** Lazy import breaks the products <-> channels cycle; failures never block the write. */
async function propagateToChannels(orgId, productId) {
  try {
    const channels = await import('../channels/channels.service.js');
    return await channels.propagatePrice(orgId, productId);
  } catch (e) { return { error: e.message }; }
}

/** All queries are scoped to the caller's organization and exclude soft-deleted docs. */
export async function list(orgId, { skip, limit, status, q }) {
  const where = { organizationId: orgId, deletedAt: null };
  if (status) where.status = status;
  if (q) where.title = { $regex: q, $options: 'i' };
  const [data, total] = await Promise.all([
    Product.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(where),
  ]);
  return { data, total };
}

export async function get(orgId, id) {
  const product = await Product.findOne({ _id: id, organizationId: orgId, deletedAt: null });
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');
  return product;
}

export function create(orgId, body) {
  return Product.create({ ...body, organizationId: orgId });
}

export async function update(orgId, id, body) {
  const before = await Product.findOne({ _id: id, organizationId: orgId, deletedAt: null }).lean();
  const product = await Product.findOneAndUpdate(
    { _id: id, organizationId: orgId, deletedAt: null },
    { $set: body },
    { new: true, runValidators: true },
  );
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');

  // Editing the price here reflects on every connected store, automatically.
  const priceChanged = before?.price?.amountMinor !== product.price?.amountMinor;
  if (priceChanged) product._propagation = await propagateToChannels(orgId, id);
  return product;
}

export async function remove(orgId, id) {
  const product = await Product.findOneAndUpdate(
    { _id: id, organizationId: orgId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true },
  );
  if (!product) throw new ApiError(404, 'Product not found', 'not_found');
  return { id, deleted: true };
}

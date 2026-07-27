import { Customer } from '../../models/customer.model.js';
import { Order } from '../../models/order.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { computeMetrics, rfmSegment } from '../../core/customer-metrics.js';
import { findDuplicates } from '../../core/duplicate-detection.js';

export async function list(orgId, { skip, limit, status, q }) {
  const where = { organizationId: orgId, deletedAt: null };
  if (status) where.status = status;
  if (q) where.$or = [{ email: { $regex: q, $options: 'i' } }, { firstName: { $regex: q, $options: 'i' } }, { lastName: { $regex: q, $options: 'i' } }];
  const [data, total] = await Promise.all([
    Customer.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Customer.countDocuments(where),
  ]);
  return { data, total };
}

export async function get(orgId, id) {
  const customer = await Customer.findOne({ _id: id, organizationId: orgId, deletedAt: null });
  if (!customer) throw new ApiError(404, 'Customer not found', 'not_found');
  return customer;
}

export function create(orgId, body) {
  return Customer.create({ ...body, organizationId: orgId });
}

export async function update(orgId, id, body) {
  const customer = await Customer.findOneAndUpdate(
    { _id: id, organizationId: orgId, deletedAt: null },
    { $set: body },
    { new: true, runValidators: true },
  );
  if (!customer) throw new ApiError(404, 'Customer not found', 'not_found');
  return customer;
}

export async function remove(orgId, id) {
  const customer = await Customer.findOneAndUpdate(
    { _id: id, organizationId: orgId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true },
  );
  if (!customer) throw new ApiError(404, 'Customer not found', 'not_found');
  return { id, deleted: true };
}

/** Add an embedded note to a customer. */
export async function addNote(orgId, id, { body, kind, authorId }) {
  const customer = await get(orgId, id);
  customer.notes.push({ body, kind, authorId });
  await customer.save();
  return customer;
}

/** Compute LTV/AOV/RFM metrics for one customer from their orders (uses the ported pure core). */
export async function metrics(orgId, id) {
  await get(orgId, id);
  const orders = await Order.find({ organizationId: orgId, customerId: id, deletedAt: null })
    .select('status totalMinor placedAt')
    .lean();
  const m = computeMetrics(orders);
  return { metrics: m, rfm: rfmSegment(m) };
}

/** Detect likely-duplicate customers within the org (uses the ported pure core). */
export async function duplicates(orgId, threshold = 0.8) {
  const customers = await Customer.find({ organizationId: orgId, deletedAt: null })
    .select('email firstName lastName phone')
    .limit(2000)
    .lean();
  const like = customers.map((c) => ({ id: c._id.toString(), email: c.email, firstName: c.firstName, lastName: c.lastName, phone: c.phone }));
  const byId = new Map(like.map((c) => [c.id, c]));
  return findDuplicates(like, threshold).map((d) => ({ ...d, a: byId.get(d.aId), b: byId.get(d.bId) }));
}

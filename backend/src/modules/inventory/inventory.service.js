import mongoose from 'mongoose';
import { StockLevel } from '../../models/stock-level.model.js';
import { StockMovement } from '../../models/stock-movement.model.js';
import { Reservation } from '../../models/reservation.model.js';
import { Warehouse } from '../../models/warehouse.model.js';
import { Order } from '../../models/order.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { applyOnHandDelta, forecast, stockStatus } from '../../core/inventory.js';

/* ------------------------------ warehouses ------------------------------ */
export function listWarehouses(orgId) {
  return Warehouse.find({ organizationId: orgId, deletedAt: null }).sort({ code: 1 });
}
export function createWarehouse(orgId, body) {
  return Warehouse.create({ ...body, organizationId: orgId });
}

/* ----------------------------- stock levels ----------------------------- */
export async function listLevels(orgId, { skip, limit, warehouseId, lowOnly }) {
  const where = { organizationId: orgId };
  if (warehouseId) where.warehouseId = warehouseId;
  const [rows, total] = await Promise.all([
    StockLevel.find(where).populate('productId', 'sku title').populate('warehouseId', 'code name').sort({ updatedAt: -1 }).skip(skip).limit(limit),
    StockLevel.countDocuments(where),
  ]);
  const data = rows
    .map((r) => {
      const o = r.toJSON();
      return { ...o, status: stockStatus(o.available, r.reorderPoint, null) };
    })
    .filter((r) => (lowOnly ? r.status === 'low' || r.status === 'out' : true));
  return { data, total };
}

/** Get-or-create the stock row for a product/warehouse pair. */
export async function ensureLevel(orgId, productId, warehouseId) {
  const row = await StockLevel.findOneAndUpdate(
    { organizationId: orgId, productId, warehouseId },
    { $setOnInsert: { onHand: 0, reserved: 0, incoming: 0 } },
    { new: true, upsert: true },
  );
  return row;
}

async function logMovement(orgId, { productId, warehouseId, kind, delta, field, reason, referenceId, actorId, note }) {
  await StockMovement.create({ organizationId: orgId, productId, warehouseId, kind, delta, field, reason, referenceId, actorId, note });
}

/**
 * Adjust on-hand by a signed delta (receipt, damage, count correction...).
 * Validated by the pure core, then applied atomically with a guard so on-hand can never
 * drop below reserved under concurrency.
 */
export async function adjust(orgId, { productId, warehouseId, delta, reason, note, actorId }) {
  const row = await ensureLevel(orgId, productId, warehouseId);
  applyOnHandDelta(row, delta); // throws on invalid

  const updated = await StockLevel.findOneAndUpdate(
    // Guard: re-check the invariant atomically at write time.
    { _id: row._id, onHand: { $gte: Math.max(0, -delta) }, $expr: { $gte: [{ $add: ['$onHand', delta] }, '$reserved'] } },
    { $inc: { onHand: delta } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'Stock changed concurrently; retry the adjustment', 'conflict');

  await logMovement(orgId, { productId, warehouseId, kind: 'ADJUSTMENT', delta, field: 'onHand', reason, referenceId: null, actorId, note });
  return updated;
}

/**
 * Reserve stock for an order. THE NO-OVERSELLING GUARANTEE: the conditional update only
 * matches when `reserved + qty <= onHand`, so two concurrent requests cannot both win.
 */
export async function reserve(orgId, { productId, warehouseId, quantity, orderId, actorId, expiresAt }) {
  if (quantity <= 0) throw new ApiError(400, 'Quantity must be positive', 'validation');
  const row = await ensureLevel(orgId, productId, warehouseId);

  const updated = await StockLevel.findOneAndUpdate(
    { _id: row._id, $expr: { $lte: [{ $add: ['$reserved', quantity] }, '$onHand'] } },
    { $inc: { reserved: quantity } },
    { new: true },
  );
  if (!updated) {
    const fresh = await StockLevel.findById(row._id);
    throw new ApiError(409, `Cannot reserve ${quantity}: only ${fresh.onHand - fresh.reserved} available`, 'insufficient_stock');
  }

  const reservation = await Reservation.create({ organizationId: orgId, productId, warehouseId, orderId, quantity, expiresAt });
  await logMovement(orgId, { productId, warehouseId, kind: 'RESERVE', delta: quantity, field: 'reserved', reason: 'SALE', referenceId: orderId, actorId });
  return { reservation, level: updated };
}

/** Release an active reservation (order cancelled / expired): reserved decreases. */
export async function release(orgId, reservationId, actorId) {
  const r = await Reservation.findOne({ _id: reservationId, organizationId: orgId, status: 'ACTIVE' });
  if (!r) throw new ApiError(404, 'Active reservation not found', 'not_found');

  const updated = await StockLevel.findOneAndUpdate(
    { organizationId: orgId, productId: r.productId, warehouseId: r.warehouseId, reserved: { $gte: r.quantity } },
    { $inc: { reserved: -r.quantity } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'Reserved quantity inconsistent; cannot release', 'conflict');

  r.status = 'RELEASED';
  await r.save();
  await logMovement(orgId, { productId: r.productId, warehouseId: r.warehouseId, kind: 'RELEASE', delta: -r.quantity, field: 'reserved', reason: 'SALE', referenceId: r.orderId?.toString(), actorId });
  return { reservation: r, level: updated };
}

/** Fulfill a reservation (goods shipped): both reserved AND on-hand decrease. */
export async function fulfill(orgId, reservationId, actorId) {
  const r = await Reservation.findOne({ _id: reservationId, organizationId: orgId, status: 'ACTIVE' });
  if (!r) throw new ApiError(404, 'Active reservation not found', 'not_found');

  const updated = await StockLevel.findOneAndUpdate(
    { organizationId: orgId, productId: r.productId, warehouseId: r.warehouseId, reserved: { $gte: r.quantity }, onHand: { $gte: r.quantity } },
    { $inc: { reserved: -r.quantity, onHand: -r.quantity } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'Stock inconsistent; cannot fulfill', 'conflict');

  r.status = 'FULFILLED';
  await r.save();
  await logMovement(orgId, { productId: r.productId, warehouseId: r.warehouseId, kind: 'FULFILL', delta: -r.quantity, field: 'onHand', reason: 'SALE', referenceId: r.orderId?.toString(), actorId });
  return { reservation: r, level: updated };
}

/* ------------------------------- history -------------------------------- */
export async function history(orgId, { productId, skip, limit }) {
  const where = { organizationId: orgId };
  if (productId) where.productId = productId;
  const [data, total] = await Promise.all([
    StockMovement.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    StockMovement.countDocuments(where),
  ]);
  return { data, total };
}

/* ------------------------------- forecast ------------------------------- */
/** Demand forecast for one product from recent order lines (uses the ported pure core). */
export async function forecastProduct(orgId, productId, windowDays = 30) {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await Order.aggregate([
    { $match: { organizationId: orgId, deletedAt: null, status: { $ne: 'CANCELLED' }, placedAt: { $gte: since } } },
    { $unwind: '$lines' },
    { $match: { 'lines.productId': new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, demandUnits: { $sum: '$lines.quantity' } } },
  ]);
  const demandUnits = rows[0]?.demandUnits ?? 0;

  const levels = await StockLevel.find({ organizationId: orgId, productId });
  const avail = levels.reduce((s, l) => s + (l.onHand - l.reserved), 0);
  const leadTimeDays = levels[0]?.leadTimeDays ?? 7;
  const safetyStock = levels.reduce((s, l) => s + l.safetyStock, 0);

  return { productId, available: avail, ...forecast({ demandUnits, windowDays, avail, leadTimeDays, safetyStock }) };
}

/** Products at or below their reorder point, worst days-of-cover first. */
export async function reorderReport(orgId) {
  const levels = await StockLevel.find({ organizationId: orgId }).populate('productId', 'sku title');
  const low = levels.filter((l) => l.onHand - l.reserved <= l.reorderPoint);
  const results = await Promise.all(
    low.map(async (l) => {
      const f = await forecastProduct(orgId, l.productId._id.toString());
      return { product: l.productId, warehouseId: l.warehouseId, available: l.onHand - l.reserved, reorderPoint: l.reorderPoint, ...f };
    }),
  );
  return results.sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity));
}

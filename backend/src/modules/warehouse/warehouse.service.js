import { BinLocation } from '../../models/bin-location.model.js';
import { BinInventory } from '../../models/bin-inventory.model.js';
import { Receipt } from '../../models/receipt.model.js';
import { PickList } from '../../models/pick-list.model.js';
import { Order } from '../../models/order.model.js';
import { StockLevel } from '../../models/stock-level.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { adjust as adjustStock } from '../inventory/inventory.service.js';
import { allocate, parseBinCode, serpentineSortKey, suggestPutaway, withSortKeys } from '../../core/warehouse.js';

/* --------------------------------- bins ---------------------------------- */
export async function createBin(orgId, body) {
  const { aisle, bay, level } = parseBinCode(body.code);
  return BinLocation.create({
    ...body, organizationId: orgId, aisle, bay, level,
    sortKey: serpentineSortKey(body.code),   // cached so picks sort in the DB
  });
}

export function listBins(orgId, { warehouseId } = {}) {
  const where = { organizationId: orgId, active: true };
  if (warehouseId) where.warehouseId = warehouseId;
  return BinLocation.find(where).sort({ sortKey: 1 });
}

/** What's physically in each bin, for a product or a whole warehouse. */
export function binContents(orgId, { productId, binId } = {}) {
  const where = { organizationId: orgId };
  if (productId) where.productId = productId;
  if (binId) where.binId = binId;
  return BinInventory.find(where).populate('binId', 'code zoneType').populate('productId', 'sku title');
}

/* ------------------------------- receiving ------------------------------- */
export const listReceipts = (orgId, { status } = {}) =>
  Receipt.find({ organizationId: orgId, ...(status ? { status } : {}) }).sort({ createdAt: -1 }).limit(100);

export const createReceipt = (orgId, body) => Receipt.create({ ...body, organizationId: orgId });

/**
 * Record received quantities against a receipt. Stock is NOT yet in a bin — it becomes
 * on-hand via the inventory module's atomic adjust, then awaits put-away.
 */
export async function receiveItems(orgId, receiptId, { lines, actorId }) {
  const receipt = await Receipt.findOne({ _id: receiptId, organizationId: orgId });
  if (!receipt) throw new ApiError(404, 'Receipt not found', 'not_found');
  if (receipt.status === 'CANCELLED') throw new ApiError(400, 'Receipt is cancelled', 'validation');

  for (const line of lines) {
    const item = receipt.items.id(line.itemId);
    if (!item) throw new ApiError(400, `Unknown receipt item ${line.itemId}`, 'validation');
    item.receivedQuantity += line.quantity;

    // Reuse the inventory module's guarded adjust — one source of truth for stock changes.
    await adjustStock(orgId, {
      productId: item.productId.toString(), warehouseId: receipt.warehouseId.toString(),
      delta: line.quantity, reason: receipt.source === 'RETURN' ? 'RETURN' : 'PURCHASE',
      note: `Receipt ${receipt.reference}`, actorId,
    });
  }

  const allReceived = receipt.items.every((i) => i.receivedQuantity >= i.expectedQuantity);
  receipt.status = allReceived ? 'RECEIVED' : 'PARTIAL';
  if (allReceived) receipt.receivedAt = new Date();
  await receipt.save();
  return receipt;
}

/** Suggest bins for everything received but not yet put away (uses the pure core). */
export async function putawaySuggestions(orgId, receiptId) {
  const receipt = await Receipt.findOne({ _id: receiptId, organizationId: orgId });
  if (!receipt) throw new ApiError(404, 'Receipt not found', 'not_found');

  const pending = receipt.items
    .filter((i) => i.receivedQuantity > i.putawayQuantity)
    .map((i) => ({ productId: i.productId.toString(), quantity: i.receivedQuantity - i.putawayQuantity, itemId: i._id.toString() }));
  if (!pending.length) return { suggestions: [] };

  const bins = await BinLocation.find({ organizationId: orgId, warehouseId: receipt.warehouseId, active: true });
  const contents = await BinInventory.find({ organizationId: orgId, binId: { $in: bins.map((b) => b._id) } });

  const productIds = new Set(pending.map((p) => p.productId));
  const binViews = bins.map((b) => {
    const rows = contents.filter((c) => c.binId.toString() === b._id.toString());
    return {
      id: b._id.toString(), code: b.code, zoneType: b.zoneType, isPickable: b.isPickable,
      maxUnits: b.maxUnits, currentUnits: rows.reduce((s, r) => s + r.quantity, 0),
      hasSameProduct: rows.some((r) => productIds.has(r.productId.toString())),
    };
  });

  const suggestions = suggestPutaway(pending, binViews);
  return { suggestions: suggestions.map((s, i) => ({ ...s, itemId: pending[i].itemId })) };
}

/** Confirm put-away: move received units into bins. */
export async function confirmPutaway(orgId, receiptId, { placements }) {
  const receipt = await Receipt.findOne({ _id: receiptId, organizationId: orgId });
  if (!receipt) throw new ApiError(404, 'Receipt not found', 'not_found');

  for (const p of placements) {
    const item = receipt.items.id(p.itemId);
    if (!item) throw new ApiError(400, `Unknown receipt item ${p.itemId}`, 'validation');
    if (item.putawayQuantity + p.quantity > item.receivedQuantity) {
      throw new ApiError(400, 'Cannot put away more than received', 'validation');
    }
    item.putawayQuantity += p.quantity;
    item.binId = p.binId;

    await BinInventory.findOneAndUpdate(
      { organizationId: orgId, binId: p.binId, productId: item.productId },
      { $inc: { quantity: p.quantity } },
      { upsert: true, new: true },
    );
  }

  const done = receipt.items.every((i) => i.putawayQuantity >= i.receivedQuantity);
  if (done) receipt.status = 'PUTAWAY';
  await receipt.save();
  return receipt;
}

/* ------------------------------- allocation ------------------------------ */
/** Allocate an order's lines across warehouses by available stock (uses the pure core). */
export async function allocateOrder(orgId, orderId, strategy = 'PRIORITY') {
  const order = await Order.findOne({ _id: orderId, organizationId: orgId, deletedAt: null });
  if (!order) throw new ApiError(404, 'Order not found', 'not_found');

  const productIds = order.lines.map((l) => l.productId);
  const levels = await StockLevel.find({ organizationId: orgId, productId: { $in: productIds } });

  const byWarehouse = new Map();
  for (const l of levels) {
    const wid = l.warehouseId.toString();
    if (!byWarehouse.has(wid)) byWarehouse.set(wid, { warehouseId: wid, priority: 0, available: {} });
    byWarehouse.get(wid).available[l.productId.toString()] = l.onHand - l.reserved;
  }

  const lines = order.lines.map((l, idx) => ({ orderItemId: String(idx), productId: l.productId.toString(), quantity: l.quantity }));
  return allocate(lines, [...byWarehouse.values()], strategy);
}

/* -------------------------------- picking -------------------------------- */
/**
 * Build a pick list for one or more orders. Items are located in bins and sequenced along
 * the serpentine path so the picker snakes through the aisles rather than backtracking.
 */
export async function createPickList(orgId, { orderIds, warehouseId, assignedTo }) {
  const orders = await Order.find({ _id: { $in: orderIds }, organizationId: orgId, deletedAt: null });
  if (!orders.length) throw new ApiError(404, 'No orders found', 'not_found');

  // Aggregate demand per product across the orders.
  const demand = new Map();
  for (const o of orders) {
    for (const l of o.lines) {
      const key = l.productId.toString();
      demand.set(key, (demand.get(key) ?? 0) + l.quantity);
    }
  }

  // Find a bin holding each product (fullest first, so one stop usually satisfies the pick).
  const contents = await BinInventory.find({ organizationId: orgId, productId: { $in: [...demand.keys()] }, quantity: { $gt: 0 } })
    .populate('binId', 'code sortKey');

  const items = [...demand.entries()].map(([productId, quantity]) => {
    const rows = contents.filter((c) => c.productId.toString() === productId).sort((a, b) => b.quantity - a.quantity);
    const bin = rows[0]?.binId;
    return { productId, quantity, bin: bin ? { code: bin.code, sortKey: bin.sortKey } : null, binId: bin?._id ?? null };
  });

  const sequenced = withSortKeys(items);

  return PickList.create({
    organizationId: orgId, warehouseId, orderIds, assignedTo,
    reference: `PL-${Date.now().toString().slice(-8)}`,
    status: assignedTo ? 'ASSIGNED' : 'PENDING',
    items: sequenced.map((s) => ({ productId: s.productId, binId: s.binId, binCode: s.bin?.code ?? null, quantity: s.quantity, sortKey: s.sortKey })),
  });
}

export const listPickLists = (orgId, { status } = {}) =>
  PickList.find({ organizationId: orgId, ...(status ? { status } : {}) }).sort({ createdAt: -1 }).limit(100);

export async function getPickList(orgId, id) {
  const pl = await PickList.findOne({ _id: id, organizationId: orgId }).populate('items.productId', 'sku title');
  if (!pl) throw new ApiError(404, 'Pick list not found', 'not_found');
  return pl;
}

/** Record a pick: decrement the bin, mark progress, complete the list when all picked. */
export async function recordPick(orgId, pickListId, { itemId, quantity }) {
  const pl = await PickList.findOne({ _id: pickListId, organizationId: orgId });
  if (!pl) throw new ApiError(404, 'Pick list not found', 'not_found');

  const item = pl.items.id(itemId);
  if (!item) throw new ApiError(400, 'Unknown pick item', 'validation');
  if (item.pickedQuantity + quantity > item.quantity) throw new ApiError(400, 'Cannot pick more than requested', 'validation');

  if (item.binId) {
    const bin = await BinInventory.findOneAndUpdate(
      { organizationId: orgId, binId: item.binId, productId: item.productId, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true },
    );
    if (!bin) throw new ApiError(409, 'Insufficient quantity in bin', 'conflict');
  }

  item.pickedQuantity += quantity;
  if (pl.status === 'PENDING' || pl.status === 'ASSIGNED') { pl.status = 'PICKING'; pl.startedAt ??= new Date(); }
  if (pl.items.every((i) => i.pickedQuantity >= i.quantity)) { pl.status = 'PICKED'; pl.completedAt = new Date(); }
  await pl.save();
  return pl;
}

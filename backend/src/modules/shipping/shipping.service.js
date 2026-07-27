import { PackageType } from '../../models/package-type.model.js';
import { CarrierRule } from '../../models/carrier-rule.model.js';
import { Shipment } from '../../models/shipment.model.js';
import { Order } from '../../models/order.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { CARRIER_REGISTRY, getAdapter, enabledCarriers, zoneFor } from '../../adapters/carrier.registry.js';
import {
  buildParcel, evaluateRules, isTrackingTerminal, mapTrackingStatus, pickRate, rankRates, selectPackage,
} from '../../core/shipping.js';

/* ----------------------------- package types ----------------------------- */
export const listPackages = (orgId) => PackageType.find({ organizationId: orgId, active: true }).sort({ name: 1 });
export const createPackage = (orgId, body) => PackageType.create({ ...body, organizationId: orgId });

/* ------------------------------ carrier rules ---------------------------- */
export const listRules = (orgId) => CarrierRule.find({ organizationId: orgId }).sort({ priority: 1 });
export const createRule = (orgId, body) => CarrierRule.create({ ...body, organizationId: orgId });
export async function removeRule(orgId, id) {
  const r = await CarrierRule.findOneAndDelete({ _id: id, organizationId: orgId });
  if (!r) throw new ApiError(404, 'Rule not found', 'not_found');
  return { id, deleted: true };
}

/* ------------------------------ rate shopping ---------------------------- */
/**
 * Rate shopping: pack the items, ask every carrier adapter for rates in parallel, let any
 * matching carrier rule force a choice, otherwise rank by strategy. Returns all rates plus
 * the selected one and an explanation.
 */
export async function shopRates(orgId, { from, to, items, strategy = 'CHEAPEST', currency = 'USD' }) {
  const packages = await listPackages(orgId);
  if (!packages.length) throw new ApiError(400, 'No package types defined', 'validation');

  const pkg = selectPackage(items, packages.map((p) => ({
    id: p._id.toString(), name: p.name, lengthMm: p.lengthMm, widthMm: p.widthMm,
    heightMm: p.heightMm, emptyWeightG: p.emptyWeightG, maxWeightG: p.maxWeightG,
  })));
  if (!pkg) throw new ApiError(400, 'No package fits the items (too heavy)', 'no_package_fits');

  const parcel = buildParcel(pkg, items);
  const shipment = { from, to, parcel, currency };

  // Query every carrier adapter concurrently; a failing carrier must not sink the request.
  const results = await Promise.allSettled(enabledCarriers().map((c) => CARRIER_REGISTRY[c].getRates(shipment)));
  const rates = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  if (!rates.length) throw new ApiError(502, 'No carrier returned rates', 'no_rates');

  // A carrier rule can override the strategy.
  const rules = await listRules(orgId);
  const ctx = { weightG: parcel.weightG, zone: zoneFor(from?.postalCode, to?.postalCode), country: to?.country, state: to?.state, itemCount: items.reduce((s, i) => s + i.quantity, 0) };
  const forced = evaluateRules(rules.map((r) => ({ isActive: r.isActive, priority: r.priority, conditions: r.conditions, action: r.action, name: r.name })), ctx);

  let selected = null;
  let ruleApplied = null;
  if (forced) {
    selected = rates.find((r) => r.carrier === forced.carrier && (!forced.serviceCode || r.serviceCode === forced.serviceCode)) ?? null;
    if (selected) ruleApplied = rules.find((r) => r.action?.carrier === forced.carrier)?.name ?? 'carrier rule';
  }
  if (!selected) selected = pickRate(rates, strategy);

  return { package: pkg, parcel, zone: ctx.zone, strategy, ruleApplied, selected, rates: rankRates(rates, strategy) };
}

/* --------------------------------- labels -------------------------------- */
/** Buy a label for an order: shops rates, buys via the carrier adapter, persists the shipment. */
export async function createShipment(orgId, { orderId, from, to, items, strategy, carrier, serviceCode }) {
  const order = await Order.findOne({ _id: orderId, organizationId: orgId, deletedAt: null });
  if (!order) throw new ApiError(404, 'Order not found', 'not_found');

  const shopping = await shopRates(orgId, { from, to, items, strategy, currency: order.currency });

  // An explicit carrier/service overrides both the rule and the strategy.
  let rate = shopping.selected;
  if (carrier) {
    rate = shopping.rates.find((r) => r.carrier === carrier.toUpperCase() && (!serviceCode || r.serviceCode === serviceCode));
    if (!rate) throw new ApiError(400, `No rate for ${carrier} ${serviceCode ?? ''}`.trim(), 'validation');
  }

  const adapter = getAdapter(rate.carrier);
  if (!adapter) throw new ApiError(400, `Unknown carrier ${rate.carrier}`, 'validation');
  const label = await adapter.buyLabel(rate, { id: orderId, from, to, parcel: shopping.parcel, currency: order.currency });

  return Shipment.create({
    organizationId: orgId, orderId, from, to, parcel: shopping.parcel,
    carrier: rate.carrier, service: rate.service, serviceCode: rate.serviceCode,
    amount: rate.amount, currency: rate.currency, estDeliveryDays: rate.estDeliveryDays,
    trackingNumber: label.trackingNumber, labelUrl: label.labelUrl,
    status: 'LABEL_PURCHASED', ruleApplied: shopping.ruleApplied,
    trackingEvents: [{ status: 'LABEL_PURCHASED', rawStatus: 'label created', message: 'Label purchased' }],
  });
}

export async function listShipments(orgId, { skip, limit, status, orderId }) {
  const where = { organizationId: orgId, deletedAt: null };
  if (status) where.status = status;
  if (orderId) where.orderId = orderId;
  const [data, total] = await Promise.all([
    Shipment.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Shipment.countDocuments(where),
  ]);
  return { data, total };
}

export async function getShipment(orgId, id) {
  const s = await Shipment.findOne({ _id: id, organizationId: orgId, deletedAt: null });
  if (!s) throw new ApiError(404, 'Shipment not found', 'not_found');
  return s;
}

/* -------------------------------- tracking ------------------------------- */
/**
 * Refresh tracking from the carrier and normalize the status. Terminal states are never
 * re-polled, so a delivered shipment stays delivered.
 */
export async function refreshTracking(orgId, id) {
  const shipment = await getShipment(orgId, id);
  if (isTrackingTerminal(shipment.status)) return shipment;

  const adapter = getAdapter(shipment.carrier);
  if (!adapter) throw new ApiError(400, `Unknown carrier ${shipment.carrier}`, 'validation');
  const raw = await adapter.track(shipment.trackingNumber);
  const status = mapTrackingStatus(raw.rawStatus);

  if (status !== shipment.status) {
    shipment.status = status;
    shipment.trackingEvents.push({ status, rawStatus: raw.rawStatus, message: `Carrier reported: ${raw.rawStatus}` });
    await shipment.save();
  }
  return shipment;
}

/** Record a tracking update pushed by a carrier webhook (normalized + terminal-aware). */
export async function applyTrackingUpdate(orgId, trackingNumber, rawStatus, message) {
  const shipment = await Shipment.findOne({ organizationId: orgId, trackingNumber });
  if (!shipment) throw new ApiError(404, 'Shipment not found', 'not_found');
  if (isTrackingTerminal(shipment.status)) return shipment;

  const status = mapTrackingStatus(rawStatus);
  shipment.status = status;
  shipment.trackingEvents.push({ status, rawStatus, message });
  await shipment.save();
  return shipment;
}

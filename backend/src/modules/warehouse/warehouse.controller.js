import { z } from 'zod';
import * as service from './warehouse.service.js';
import { ok, created } from '../../utils/envelope.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
const binSchema = z.object({
  warehouseId: objectId, code: z.string().min(1),
  zoneType: z.enum(['RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'SHIPPING', 'STAGING', 'QUARANTINE']).optional(),
  binType: z.enum(['SHELF', 'PALLET', 'FLOOR', 'BULK', 'BIN']).optional(),
  maxUnits: z.number().int().positive().nullable().optional(), isPickable: z.boolean().optional(),
});
const receiptSchema = z.object({
  warehouseId: objectId, reference: z.string().min(1),
  source: z.enum(['PURCHASE_ORDER', 'RETURN', 'TRANSFER', 'MANUAL']).optional(),
  items: z.array(z.object({ productId: objectId, expectedQuantity: z.number().int().min(0) })).min(1),
  notes: z.string().optional(),
});
const receiveSchema = z.object({ lines: z.array(z.object({ itemId: z.string(), quantity: z.number().int().positive() })).min(1) });
const putawaySchema = z.object({ placements: z.array(z.object({ itemId: z.string(), binId: objectId, quantity: z.number().int().positive() })).min(1) });
const pickListSchema = z.object({ orderIds: z.array(objectId).min(1), warehouseId: objectId, assignedTo: z.string().optional() });
const pickSchema = z.object({ itemId: z.string(), quantity: z.number().int().positive() });

export async function listBins(req, res) { ok(res, await service.listBins(req.user.orgId, { warehouseId: req.query.warehouseId })); }
export async function createBin(req, res) { created(res, await service.createBin(req.user.orgId, binSchema.parse(req.body))); }
export async function binContents(req, res) { ok(res, await service.binContents(req.user.orgId, { productId: req.query.productId, binId: req.query.binId })); }

export async function listReceipts(req, res) { ok(res, await service.listReceipts(req.user.orgId, { status: req.query.status })); }
export async function createReceipt(req, res) { created(res, await service.createReceipt(req.user.orgId, receiptSchema.parse(req.body))); }
export async function receiveItems(req, res) { ok(res, await service.receiveItems(req.user.orgId, req.params.id, { ...receiveSchema.parse(req.body), actorId: req.user.id })); }
export async function putawaySuggestions(req, res) { ok(res, await service.putawaySuggestions(req.user.orgId, req.params.id)); }
export async function confirmPutaway(req, res) { ok(res, await service.confirmPutaway(req.user.orgId, req.params.id, putawaySchema.parse(req.body))); }

export async function allocateOrder(req, res) { ok(res, await service.allocateOrder(req.user.orgId, req.params.orderId, req.query.strategy)); }

export async function listPickLists(req, res) { ok(res, await service.listPickLists(req.user.orgId, { status: req.query.status })); }
export async function createPickList(req, res) { created(res, await service.createPickList(req.user.orgId, pickListSchema.parse(req.body))); }
export async function getPickList(req, res) { ok(res, await service.getPickList(req.user.orgId, req.params.id)); }
export async function recordPick(req, res) { ok(res, await service.recordPick(req.user.orgId, req.params.id, pickSchema.parse(req.body))); }

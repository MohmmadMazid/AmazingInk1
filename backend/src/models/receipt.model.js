import mongoose from 'mongoose';

const ReceiptItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    expectedQuantity: { type: Number, default: 0, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    putawayQuantity: { type: Number, default: 0, min: 0 },
    binId: { type: mongoose.Schema.Types.ObjectId, ref: 'BinLocation', default: null },
  },
  { _id: true },
);

/**
 * Inbound goods. `source: PURCHASE_ORDER` is the hook a future Purchasing module fills —
 * receiving already understands POs even though nothing upstream creates them yet.
 */
const ReceiptSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    reference: { type: String, required: true },
    source: { type: String, enum: ['PURCHASE_ORDER', 'RETURN', 'TRANSFER', 'MANUAL'], default: 'MANUAL' },
    status: { type: String, enum: ['EXPECTED', 'PARTIAL', 'RECEIVED', 'PUTAWAY', 'CANCELLED'], default: 'EXPECTED', index: true },
    items: { type: [ReceiptItemSchema], default: [] },
    receivedAt: Date,
    notes: String,
  },
  { timestamps: true },
);

ReceiptSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
export const Receipt = mongoose.model('Receipt', ReceiptSchema);

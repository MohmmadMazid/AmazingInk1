import mongoose from 'mongoose';

/** Append-only ledger of every stock change — the audit trail behind each adjustment,
 *  reservation, release, and fulfillment. */
const StockMovementSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    kind: { type: String, enum: ['ADJUSTMENT', 'RESERVE', 'RELEASE', 'FULFILL', 'RECEIPT'], required: true },
    delta: { type: Number, required: true },      // signed change applied
    field: { type: String, enum: ['onHand', 'reserved'], required: true },
    reason: { type: String, enum: ['PURCHASE', 'SALE', 'RETURN', 'DAMAGE', 'COUNT', 'TRANSFER', 'CORRECTION'], default: 'CORRECTION' },
    referenceId: String,                           // e.g. the order id
    actorId: String,
    note: String,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

StockMovementSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
export const StockMovement = mongoose.model('StockMovement', StockMovementSchema);

import mongoose from 'mongoose';

/**
 * Stock for one product at one warehouse. `available` and `sellable` are NOT stored — they are
 * derived (see core/inventory.js) and exposed as virtuals so the invariant can never drift.
 */
const StockLevelSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    onHand: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    incoming: { type: Number, default: 0, min: 0 },
    bufferQuantity: { type: Number, default: 0, min: 0 },
    safetyStock: { type: Number, default: 0, min: 0 },
    reorderPoint: { type: Number, default: 0, min: 0 },
    leadTimeDays: { type: Number, default: 7, min: 0 },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

StockLevelSchema.virtual('available').get(function () { return this.onHand - this.reserved; });
StockLevelSchema.virtual('sellable').get(function () { return Math.max(0, this.onHand - this.reserved - this.bufferQuantity); });

StockLevelSchema.index({ organizationId: 1, productId: 1, warehouseId: 1 }, { unique: true });
StockLevelSchema.index({ organizationId: 1, warehouseId: 1 });

export const StockLevel = mongoose.model('StockLevel', StockLevelSchema);

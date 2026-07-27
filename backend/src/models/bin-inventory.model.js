import mongoose from 'mongoose';

/** How many units of a product sit in a specific bin. */
const BinInventorySchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    binId: { type: mongoose.Schema.Types.ObjectId, ref: 'BinLocation', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

BinInventorySchema.index({ organizationId: 1, binId: 1, productId: 1 }, { unique: true });
BinInventorySchema.index({ organizationId: 1, productId: 1 });
export const BinInventory = mongoose.model('BinInventory', BinInventorySchema);

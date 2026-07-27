import mongoose from 'mongoose';

/** Append-only audit trail of every price change. */
const PriceChangeSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    oldPrice: Number,
    newPrice: Number,
    source: { type: String, enum: ['MANUAL', 'RULE', 'BULK', 'PROMOTION', 'DYNAMIC', 'IMPORT'], default: 'MANUAL' },
    actorId: String,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

PriceChangeSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
export const PriceChange = mongoose.model('PriceChange', PriceChangeSchema);

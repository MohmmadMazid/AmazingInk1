import mongoose from 'mongoose';

const PromotionSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['PERCENT_OFF', 'AMOUNT_OFF', 'FIXED_PRICE'], required: true },
    value: { type: Number, required: true, min: 0 }, // bps for PERCENT_OFF, minor units otherwise
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    startsAt: Date,
    endsAt: Date,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Promotion = mongoose.model('Promotion', PromotionSchema);

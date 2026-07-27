import mongoose from 'mongoose';
import { DEFAULT_CURRENCY } from '../core/money.js';

/** Per-product pricing inputs: cost, guardrails, and the marketplace fee schedule. */
const VariantPricingSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    currency: { type: String, default: DEFAULT_CURRENCY, uppercase: true },
    cost: { type: Number, default: null, min: 0 },
    basePrice: { type: Number, default: null, min: 0 },
    minPrice: { type: Number, default: null, min: 0 },
    maxPrice: { type: Number, default: null, min: 0 },
    fees: {
      referralBps: { type: Number, default: 0 },
      paymentBps: { type: Number, default: 0 },
      paymentFixed: { type: Number, default: 0 },
      fixedFee: { type: Number, default: 0 },
      otherFee: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

VariantPricingSchema.index({ organizationId: 1, productId: 1 }, { unique: true });
export const VariantPricing = mongoose.model('VariantPricing', VariantPricingSchema);

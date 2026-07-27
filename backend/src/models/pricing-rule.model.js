import mongoose from 'mongoose';

/** A pricing strategy applied to a product (or globally). Feeds the pure pricing engine. */
const PricingRuleSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['COST_PLUS_MARGIN', 'MARKUP_PERCENT', 'FIXED_PRICE', 'COMPETITIVE', 'MARGIN_FLOOR'], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }, // null = global
    marginBps: Number,
    markupBps: Number,
    fixedPrice: Number,
    competitiveDeltaBps: Number,
    rounding: { type: String, enum: ['NONE', 'CHARM_99', 'CHARM_95', 'NEAREST_UNIT', 'NEAREST_10'], default: 'NONE' },
    respectMinMax: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PricingRuleSchema.index({ organizationId: 1, productId: 1, active: 1, priority: -1 });
export const PricingRule = mongoose.model('PricingRule', PricingRuleSchema);

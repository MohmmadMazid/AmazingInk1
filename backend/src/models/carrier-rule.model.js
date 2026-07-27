import mongoose from 'mongoose';

/**
 * A rule that forces a carrier/service choice when its conditions match the rate context
 * (e.g. weightG > 10000 -> use FEDEX Ground). Evaluated by evaluateRules() in the core.
 */
const CarrierRuleSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    priority: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
    // conditions: [{ field: 'weightG', op: 'gte', value: 10000 }]
    conditions: { type: [{ field: String, op: { type: String, enum: ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in'] }, value: mongoose.Schema.Types.Mixed, _id: false }], default: [] },
    // action: { carrier: 'FEDEX', serviceCode: 'HOME_DELIVERY' }
    action: { carrier: String, serviceCode: String, _id: false },
  },
  { timestamps: true },
);
export const CarrierRule = mongoose.model('CarrierRule', CarrierRuleSchema);

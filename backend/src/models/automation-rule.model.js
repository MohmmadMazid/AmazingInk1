import mongoose from 'mongoose';

/**
 * An event-triggered rule: when `event` fires and `condition` matches the payload,
 * run `jobKey` (or the workflow). Conditions are nested all/any/not trees.
 */
const AutomationRuleSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    event: { type: String, required: true },   // 'order.created', 'inventory.low_stock'
    condition: { type: mongoose.Schema.Types.Mixed, default: {} },
    jobKey: String,
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
    enabled: { type: Boolean, default: true },
    lastFiredAt: Date,
    fireCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

AutomationRuleSchema.index({ organizationId: 1, event: 1, enabled: 1 });
export const AutomationRule = mongoose.model('AutomationRule', AutomationRuleSchema);

import mongoose from 'mongoose';

/**
 * Pre-aggregated daily sales. Dashboards read THIS, never the orders collection — the
 * design that keeps analytics O(days) instead of O(orders) at scale.
 *
 * One document per (org, date, channel). Rebuilt idempotently by the rollup job.
 */
const DailySalesRollupSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    date: { type: String, required: true },        // 'YYYY-MM-DD' (UTC)
    channel: { type: String, default: 'all' },
    orders: { type: Number, default: 0 },
    units: { type: Number, default: 0 },
    customers: { type: Number, default: 0 },
    grossRevenue: { type: Number, default: 0 },    // minor units
    discounts: { type: Number, default: 0 },
    refunds: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },
    cogs: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

DailySalesRollupSchema.index({ organizationId: 1, date: 1, channel: 1 }, { unique: true });
DailySalesRollupSchema.index({ organizationId: 1, date: -1 });
export const DailySalesRollup = mongoose.model('DailySalesRollup', DailySalesRollupSchema);

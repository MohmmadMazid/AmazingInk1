import mongoose from 'mongoose';

/** A connected sales channel (marketplace account). Credentials live in the secret store. */
const ChannelSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true }, // AMAZON, EBAY, SHOPIFY...
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    // Sync rule applied to every listing on this channel (overridable per listing).
    syncRule: {
      allocation: { type: String, enum: ['SUM_ALL', 'PRIORITY_FILL'], default: 'SUM_ALL' },
      bufferPercent: { type: Number, default: 0 },   // basis points
      bufferQty: { type: Number, default: 0 },
      pushPercent: { type: Number, default: 10000 }, // 100%
      minPush: { type: Number, default: 0 },
      maxPush: { type: Number, default: null },
    },
    priceRule: {
      type: { type: String, enum: ['PASSTHROUGH', 'MARKUP_PERCENT', 'MARKUP_AMOUNT', 'FIXED'], default: 'PASSTHROUGH' },
      value: { type: Number, default: 0 },
      rounding: { type: String, enum: ['NONE', 'CHARM_99', 'NEAREST_UNIT'], default: 'NONE' },
    },
    conflictPolicy: { type: String, enum: ['SYSTEM_WINS', 'MARKETPLACE_WINS', 'NEWEST_WINS'], default: 'SYSTEM_WINS' },
  },
  { timestamps: true },
);

ChannelSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const Channel = mongoose.model('Channel', ChannelSchema);

import mongoose from 'mongoose';

const RateLimitPolicySchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    scope: { type: String, enum: ['IP', 'USER', 'API_KEY', 'ROUTE', 'GLOBAL'], default: 'IP' },
    routePattern: String,
    windowSec: { type: Number, default: 60 },
    maxRequests: { type: Number, default: 100 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const RateLimitPolicy = mongoose.model('RateLimitPolicy', RateLimitPolicySchema);

const IpAllowlistEntrySchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    cidr: { type: String, required: true },
    label: String,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const IpAllowlistEntry = mongoose.model('IpAllowlistEntry', IpAllowlistEntrySchema);

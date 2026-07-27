import mongoose from 'mongoose';

/** A feature flag with an audience rule evaluated by the pure core. */
const FeatureFlagSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    description: String,
    enabled: { type: Boolean, default: false },
    audience: { type: String, enum: ['ALL', 'ROLE', 'PERCENTAGE', 'USERS'], default: 'ALL' },
    rolloutPct: { type: Number, default: 0, min: 0, max: 100 },
    roleFilter: { type: String, default: null },
    userIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

FeatureFlagSchema.index({ organizationId: 1, key: 1 }, { unique: true });
export const FeatureFlag = mongoose.model('FeatureFlag', FeatureFlagSchema);

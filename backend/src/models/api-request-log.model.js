import mongoose from 'mongoose';

/** Append-only log of every public-API request — powers usage analytics and quotas. */
const ApiRequestLogSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    keyId: String,
    clientId: String,
    method: { type: String, required: true },
    path: { type: String, required: true },
    version: String,
    statusCode: { type: Number, required: true },
    latencyMs: { type: Number, required: true },
    environment: { type: String, enum: ['LIVE', 'SANDBOX'], default: 'LIVE' },
    ip: String,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);
ApiRequestLogSchema.index({ organizationId: 1, createdAt: -1 });
export const ApiRequestLog = mongoose.model('ApiRequestLog', ApiRequestLogSchema);

const ApiVersionSchema = new mongoose.Schema(
  {
    version: { type: String, required: true, unique: true },
    status: { type: String, enum: ['ACTIVE', 'DEPRECATED', 'SUNSET'], default: 'ACTIVE' },
    releasedAt: { type: Date, default: Date.now },
    deprecatedAt: Date,
    sunsetAt: Date,
    notes: String,
  },
  { timestamps: false },
);
export const ApiVersion = mongoose.model('ApiVersion', ApiVersionSchema);

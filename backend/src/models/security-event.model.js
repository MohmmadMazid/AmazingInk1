import mongoose from 'mongoose';

/** Append-only security event stream. Severity is derived by the pure core. */
const SecurityEventSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    severity: { type: String, enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'INFO', index: true },
    userId: String,
    email: String,
    ip: String,
    userAgent: String,
    detail: mongoose.Schema.Types.Mixed,
    riskScore: Number,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);
SecurityEventSchema.index({ organizationId: 1, severity: 1, createdAt: -1 });
export const SecurityEvent = mongoose.model('SecurityEvent', SecurityEventSchema);

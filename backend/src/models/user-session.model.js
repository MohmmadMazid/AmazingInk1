import mongoose from 'mongoose';

/** A session. Only the token HASH is stored — the raw token lives in the client. */
const UserSessionSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'REVOKED'], default: 'ACTIVE', index: true },
    ip: String,
    userAgent: String,
    deviceLabel: String,
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { timestamps: true },
);
export const UserSession = mongoose.model('UserSession', UserSessionSchema);

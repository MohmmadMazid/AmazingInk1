import mongoose from 'mongoose';

/**
 * A developer-platform API key. Distinct from the internal ApiCredential (admin module) —
 * these are issued to external integrations, and the PREFIX encodes the environment.
 * Only the hash is stored; the plaintext is shown once.
 */
const PlatformApiKeySchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    maskedKey: { type: String, required: true },
    scopes: { type: [String], default: [] },
    environment: { type: String, enum: ['LIVE', 'SANDBOX'], default: 'SANDBOX', index: true },
    rateTier: { type: String, enum: ['FREE', 'STANDARD', 'ENTERPRISE'], default: 'FREE' },
    status: { type: String, enum: ['ACTIVE', 'REVOKED'], default: 'ACTIVE', index: true },
    lastUsedAt: Date,
    expiresAt: Date,
  },
  { timestamps: true },
);
export const PlatformApiKey = mongoose.model('PlatformApiKey', PlatformApiKeySchema);

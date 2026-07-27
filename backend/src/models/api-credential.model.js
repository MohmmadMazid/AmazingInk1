import mongoose from 'mongoose';

/** An API credential. Only the sha-256 hash is stored — the plaintext is shown once. */
const ApiCredentialSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    prefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    scopes: { type: [String], default: [] },
    status: { type: String, enum: ['ACTIVE', 'REVOKED'], default: 'ACTIVE', index: true },
    lastUsedAt: Date,
    expiresAt: Date,
    createdBy: String,
  },
  { timestamps: true },
);
export const ApiCredential = mongoose.model('ApiCredential', ApiCredentialSchema);

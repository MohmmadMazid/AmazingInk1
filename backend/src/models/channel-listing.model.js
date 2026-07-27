import mongoose from 'mongoose';

/**
 * A product published to one connected store. Tracks what price/qty we last pushed so the
 * delta gate can skip no-op syncs, and what the remote currently reports so we can detect
 * drift (someone edited the price directly in the eBay UI).
 */
const ChannelListingSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChannelConnection', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    externalListingId: String,        // eBay item id / Shopify variant id
    status: { type: String, enum: ['DRAFT', 'PUBLISHING', 'ACTIVE', 'PAUSED', 'ERROR', 'ENDED'], default: 'DRAFT', index: true },

    lastPushedPriceMinor: { type: Number, default: null },
    lastPushedQty: { type: Number, default: null },
    remotePriceMinor: { type: Number, default: null },
    remoteQty: { type: Number, default: null },

    lastSyncStatus: { type: String, enum: ['IDLE', 'PENDING', 'SYNCED', 'FAILED', 'CONFLICT'], default: 'IDLE' },
    lastSyncedAt: Date,
    lastError: String,
  },
  { timestamps: true, optimisticConcurrency: true },
);

ChannelListingSchema.index({ organizationId: 1, connectionId: 1, productId: 1 }, { unique: true });
export const ChannelListing = mongoose.model('ChannelListing', ChannelListingSchema);

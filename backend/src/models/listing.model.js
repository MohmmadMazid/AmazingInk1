import mongoose from 'mongoose';

/** A product published to one channel, with its sync state. */
const ListingSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    externalId: String,                    // the marketplace's own listing id
    title: String,
    status: { type: String, enum: ['DRAFT', 'SCHEDULED', 'PUBLISHING', 'ACTIVE', 'INACTIVE', 'ERROR', 'ENDED'], default: 'DRAFT', index: true },

    // Sync state — what we last pushed, and what the marketplace last reported.
    lastPushedQty: { type: Number, default: null },
    lastPushedPrice: { type: Number, default: null },
    remoteQty: { type: Number, default: null },
    lastSyncStatus: { type: String, enum: ['IDLE', 'PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'CONFLICT'], default: 'IDLE' },
    lastSyncedAt: Date,
    errorCount: { type: Number, default: 0 },
    lastError: String,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

ListingSchema.index({ organizationId: 1, productId: 1, channelId: 1 }, { unique: true });
ListingSchema.index({ organizationId: 1, lastSyncStatus: 1 });
export const Listing = mongoose.model('Listing', ListingSchema);

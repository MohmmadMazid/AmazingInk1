import mongoose from 'mongoose';

/** A detected drift between our quantity and the marketplace's, plus how it was resolved. */
const SyncConflictSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    type: { type: String, enum: ['DRIFT', 'EXTERNAL_CHANGE', 'STALE_VERSION', 'PUSH_REJECTED'], default: 'DRIFT' },
    resolution: { type: String, enum: ['SYSTEM_WINS', 'MARKETPLACE_WINS', 'NEWEST_WINS', 'MANUAL', 'UNRESOLVED'], default: 'UNRESOLVED' },
    detail: String,
    systemQty: Number,
    marketplaceQty: Number,
    resolvedAt: Date,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);
export const SyncConflict = mongoose.model('SyncConflict', SyncConflictSchema);

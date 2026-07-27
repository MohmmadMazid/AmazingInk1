import mongoose from 'mongoose';

/**
 * THE OUTBOX. Every intent to change a marketplace is written here first, then drained by a
 * worker. The unique `idempotencyKey` means a retry of the same logical push can never be
 * enqueued twice — closing the double-post gap flagged in the platform review.
 *
 * Lifecycle: PENDING -> (attempt) -> SENT | FAILED (reschedule w/ backoff) | DEAD (exhausted).
 */
const SyncOutboxSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    field: { type: String, enum: ['quantity', 'price', 'status'], required: true },
    value: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED', 'DEAD'], default: 'PENDING', index: true },
    attempt: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 6 },
    nextAttemptAt: { type: Date, default: Date.now },
    lastStatusCode: Number,
    lastError: String,
    sentAt: Date,
  },
  { timestamps: true },
);

SyncOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
export const SyncOutbox = mongoose.model('SyncOutbox', SyncOutboxSchema);

import mongoose from 'mongoose';

/** An in-app notification for one user, plus its per-channel delivery records. */
const DeliverySchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS', 'PUSH'], required: true },
    status: { type: String, enum: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'], default: 'PENDING' },
    providerId: String,
    error: String,
    sentAt: Date,
  },
  { _id: false },
);

const NotificationSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    category: { type: String, required: true },   // ORDER, INVENTORY, ERROR, SYNC_FAILURE...
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
    title: { type: String, required: true },
    body: String,
    entityType: String,
    entityId: String,
    dedupeKey: { type: String, index: true },
    readAt: { type: Date, default: null },
    deferred: { type: Boolean, default: false },  // held by quiet hours, awaiting digest
    digestedAt: { type: Date, default: null },
    deliveries: { type: [DeliverySchema], default: [] },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

NotificationSchema.index({ organizationId: 1, userId: 1, readAt: 1, createdAt: -1 });
export const Notification = mongoose.model('Notification', NotificationSchema);

import mongoose from 'mongoose';

/** A developer's webhook subscription: an endpoint URL bound to event patterns. */
const EventSubscriptionSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    endpointUrl: { type: String, required: true },
    description: String,
    eventTypes: { type: [String], default: [] },
    secretHash: { type: String, required: true },
    signingSecret: { type: String, required: true, select: false },  // needed to sign each payload
    environment: { type: String, enum: ['LIVE', 'SANDBOX'], default: 'SANDBOX' },
    status: { type: String, enum: ['ACTIVE', 'PAUSED', 'DISABLED'], default: 'ACTIVE', index: true },
  },
  { timestamps: true },
);
export const EventSubscription = mongoose.model('EventSubscription', EventSubscriptionSchema);

/** One delivery attempt of one event to one subscriber, with its retry state. */
const EventDeliverySchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSubscription', required: true },
    eventType: { type: String, required: true },
    eventId: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'DEAD'], default: 'PENDING', index: true },
    attempt: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 8 },
    nextAttemptAt: Date,
    lastStatusCode: Number,
    lastError: String,
    deliveredAt: Date,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);
EventDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
export const EventDelivery = mongoose.model('EventDelivery', EventDeliverySchema);

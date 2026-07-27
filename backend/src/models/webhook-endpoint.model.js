import mongoose from 'mongoose';

const WebhookDeliverySchema = new mongoose.Schema(
  {
    event: String,
    status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING' },
    statusCode: Number,
    error: String,
    signature: String,
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

/** An outbound webhook subscription. The signing secret is stored so we can sign each payload. */
const WebhookEndpointSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    url: { type: String, required: true },
    events: { type: [String], default: [] },   // ['order.created', 'inventory.low_stock']
    secret: { type: String, required: true },
    active: { type: Boolean, default: true },
    recentDeliveries: { type: [WebhookDeliverySchema], default: [] },
  },
  { timestamps: true },
);
export const WebhookEndpoint = mongoose.model('WebhookEndpoint', WebhookEndpointSchema);

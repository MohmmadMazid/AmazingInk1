import mongoose from 'mongoose';

/** A reusable message template with {{var}} placeholders. */
const NotificationTemplateSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    key: { type: String, required: true },   // e.g. 'order.shipped'
    category: { type: String, required: true },
    subject: String,
    bodyText: { type: String, required: true },
    bodyHtml: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

NotificationTemplateSchema.index({ organizationId: 1, key: 1 }, { unique: true });
export const NotificationTemplate = mongoose.model('NotificationTemplate', NotificationTemplateSchema);

import mongoose from 'mongoose';

/** Per-user master switches, quiet hours, and digest cadence. */
const NotificationSettingSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    inAppEnabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
    smsEnabled: { type: Boolean, default: false },
    pushEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: Number, default: null },  // minutes from midnight
    quietHoursEnd: { type: Number, default: null },
    digest: { type: String, enum: ['NONE', 'DAILY', 'WEEKLY'], default: 'NONE' },
    digestHour: { type: Number, default: 8 },
    // Per-(category, channel) overrides.
    preferences: {
      type: [{ category: String, channel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS', 'PUSH'] }, enabled: Boolean, _id: false }],
      default: [],
    },
  },
  { timestamps: true },
);

NotificationSettingSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
export const NotificationSetting = mongoose.model('NotificationSetting', NotificationSettingSchema);

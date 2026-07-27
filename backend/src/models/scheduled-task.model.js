import mongoose from 'mongoose';

/** A cron-scheduled job. nextRunAt is computed by the pure cron core. */
const ScheduledTaskSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    jobKey: { type: String, required: true },
    cron: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true },
    lastRunAt: Date,
    nextRunAt: { type: Date, index: true },
  },
  { timestamps: true },
);
export const ScheduledTask = mongoose.model('ScheduledTask', ScheduledTaskSchema);

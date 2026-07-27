import mongoose from 'mongoose';

/** One execution of a job, with its retry attempts and state history. */
const JobRunSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    jobKey: { type: String, required: true },
    trigger: { type: String, enum: ['SCHEDULE', 'EVENT', 'MANUAL', 'WEBHOOK'], default: 'MANUAL' },
    state: { type: String, enum: ['QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'RETRYING', 'DEAD', 'PAUSED'], default: 'QUEUED', index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: mongoose.Schema.Types.Mixed,
    attempt: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    nextRetryAt: Date,
    error: String,
    startedAt: Date,
    finishedAt: Date,
    durationMs: Number,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

JobRunSchema.index({ organizationId: 1, state: 1, createdAt: -1 });
export const JobRun = mongoose.model('JobRun', JobRunSchema);

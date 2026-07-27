import mongoose from 'mongoose';

/** A named job type with its retry policy. Handlers are registered in code. */
const JobDefinitionSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    key: { type: String, required: true },   // matches a registered handler
    name: { type: String, required: true },
    description: String,
    retry: {
      strategy: { type: String, enum: ['FIXED', 'LINEAR', 'EXPONENTIAL'], default: 'EXPONENTIAL' },
      delayMs: { type: Number, default: 1000 },
      maxAttempts: { type: Number, default: 5 },
      capMs: { type: Number, default: 3600000 },
      jitter: { type: Boolean, default: false },
    },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

JobDefinitionSchema.index({ organizationId: 1, key: 1 }, { unique: true });
export const JobDefinition = mongoose.model('JobDefinition', JobDefinitionSchema);

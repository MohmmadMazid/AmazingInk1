import mongoose from 'mongoose';

/** Append-only log of every LLM call, with token counts and cost in minor units. */
const AiUsageLogSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    userId: String,
    feature: { type: String, required: true },   // 'content.description', 'insights.summary'...
    provider: { type: String, required: true },
    model: String,
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    costMinor: { type: Number, default: 0 },
    status: { type: String, enum: ['SUCCESS', 'ERROR'], default: 'SUCCESS' },
    error: String,
    latencyMs: Number,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);
AiUsageLogSchema.index({ organizationId: 1, feature: 1, createdAt: -1 });
export const AiUsageLog = mongoose.model('AiUsageLog', AiUsageLogSchema);

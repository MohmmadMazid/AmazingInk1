import mongoose from 'mongoose';

/** A versioned prompt template with {{var}} placeholders. */
const AiPromptTemplateSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    description: String,
    systemPrompt: { type: String, required: true },
    userTemplate: { type: String, required: true },
    json: { type: Boolean, default: false },   // ask the model for structured output
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
AiPromptTemplateSchema.index({ organizationId: 1, key: 1 }, { unique: true });
export const AiPromptTemplate = mongoose.model('AiPromptTemplate', AiPromptTemplateSchema);

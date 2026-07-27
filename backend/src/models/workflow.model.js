import mongoose from 'mongoose';

const WorkflowStepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    jobKey: { type: String, required: true },
    input: { type: mongoose.Schema.Types.Mixed, default: {} },   // supports {{trigger.x}} interpolation
    condition: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: true },
);

/** A multi-step workflow. Each step's input can reference the trigger and prior results. */
const WorkflowSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'PAUSED'], default: 'DRAFT' },
    steps: { type: [WorkflowStepSchema], default: [] },
  },
  { timestamps: true },
);
export const Workflow = mongoose.model('Workflow', WorkflowSchema);

const WorkflowRunSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
    status: { type: String, enum: ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'], default: 'PENDING' },
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    stepResults: { type: [{ name: String, status: String, result: mongoose.Schema.Types.Mixed, error: String, _id: false }], default: [] },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true },
);
export const WorkflowRun = mongoose.model('WorkflowRun', WorkflowRunSchema);

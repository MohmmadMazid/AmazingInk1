import mongoose from 'mongoose';

const DataRetentionPolicySchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    entity: { type: String, required: true },   // 'SecurityEvent', 'LoginAttempt', 'ApiRequestLog'
    ttlDays: { type: Number, required: true, min: 1 },
    action: { type: String, enum: ['DELETE', 'ANONYMIZE'], default: 'DELETE' },
    piiFields: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
    lastRunAt: Date,
  },
  { timestamps: true },
);
DataRetentionPolicySchema.index({ organizationId: 1, entity: 1 }, { unique: true });
export const DataRetentionPolicy = mongoose.model('DataRetentionPolicy', DataRetentionPolicySchema);

const GdprRequestSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    type: { type: String, enum: ['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION'], required: true },
    subjectEmail: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'], default: 'PENDING' },
    result: mongoose.Schema.Types.Mixed,
    requestedBy: String,
    completedAt: Date,
  },
  { timestamps: true },
);
export const GdprRequest = mongoose.model('GdprRequest', GdprRequestSchema);

const ComplianceControlSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    framework: { type: String, enum: ['SOC2', 'GDPR', 'ISO27001', 'HIPAA'], required: true },
    controlId: { type: String, required: true },
    title: { type: String, required: true },
    status: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NOT_APPLICABLE'], default: 'NOT_STARTED' },
    owner: String,
    notes: String,
  },
  { timestamps: true },
);
ComplianceControlSchema.index({ organizationId: 1, framework: 1, controlId: 1 }, { unique: true });
export const ComplianceControl = mongoose.model('ComplianceControl', ComplianceControlSchema);

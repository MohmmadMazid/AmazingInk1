import mongoose from 'mongoose';

/** Append-only audit trail. Diffs are pre-redacted by the core before they land here. */
const AuditLogSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['CHANGE', 'ACTIVITY', 'SECURITY'], default: 'CHANGE' },
    action: { type: String, required: true },      // create | update | delete | login...
    resource: { type: String, required: true },    // Product | Order | Role...
    resourceId: String,
    actorId: String,
    actorEmail: String,
    summary: String,
    diff: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: String,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

AuditLogSchema.index({ organizationId: 1, resource: 1, createdAt: -1 });
export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

import mongoose from 'mongoose';

/** A named role granting a set of permissions (wildcards allowed). */
const RoleSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: String,
    permissions: { type: [String], default: [] },
    system: { type: Boolean, default: false },   // system roles cannot be deleted
  },
  { timestamps: true },
);

RoleSchema.index({ organizationId: 1, name: 1 }, { unique: true });
export const Role = mongoose.model('Role', RoleSchema);

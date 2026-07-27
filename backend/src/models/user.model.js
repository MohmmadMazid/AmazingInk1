import mongoose from 'mongoose';

/** A user with an embedded permission set (granular resource:action strings). */
const UserSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }, // never returned by default
    firstName: String,
    lastName: String,
    roles: { type: [String], default: [] },
    permissions: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

UserSchema.index({ organizationId: 1, email: 1 }, { unique: true });

// Strip sensitive fields from JSON output.
UserSchema.set('toJSON', {
  transform: (_doc, ret) => { delete ret.passwordHash; delete ret.__v; return ret; },
});

export const User = mongoose.model('User', UserSchema);

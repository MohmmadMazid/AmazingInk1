import mongoose from 'mongoose';

const LoginAttemptSchema = new mongoose.Schema(
  {
    organizationId: { type: String, index: true },
    email: { type: String, required: true, index: true },
    success: { type: Boolean, required: true },
    ip: String,
    userAgent: String,
    reason: String,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);
export const LoginAttempt = mongoose.model('LoginAttempt', LoginAttemptSchema);

const AccountLockoutSchema = new mongoose.Schema(
  {
    organizationId: String,
    email: { type: String, required: true, unique: true },
    lockedUntil: Date,
    failedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const AccountLockout = mongoose.model('AccountLockout', AccountLockoutSchema);

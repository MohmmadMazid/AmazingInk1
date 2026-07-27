import dotenv from 'dotenv';
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mccms',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
  /** Platform default currency. Every org can override it in Settings. */
  currency: (process.env.CURRENCY ?? 'GBP').toUpperCase(),
};

// Fail fast on missing critical config in production.
if (env.nodeEnv === 'production' && env.jwtSecret === 'change-me') {
  throw new Error('JWT_SECRET must be set in production');
}

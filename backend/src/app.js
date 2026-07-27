import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import api from './routes.js';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';
import { securityHeaders, auditPermissionDenials } from './middleware/security.middleware.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(securityHeaders);   // explicit baseline headers on every response
  // app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(
    cors({
      // origin: env.corsOrigins,
      // origin: "https://amzingink.netlify.app",
      "origin": "*",
      "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
      "preflightContinue": false,
      "optionsSuccessStatus": 204
    })
  );
  app.use(express.json({ limit: '5mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.use('/api', api);

  app.use(notFound);
  app.use(auditPermissionDenials);   // log 403s as security events, then fall through
  app.use(errorHandler);
  return app;
}

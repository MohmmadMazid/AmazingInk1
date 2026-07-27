import { ApiError } from '../utils/asyncHandler.js';

/** 404 for unmatched routes. */
export const notFound = (req, res) =>
  res.status(404).json({ success: false, error: { code: 'not_found', message: `Route ${req.method} ${req.path} not found` } });

/** Central error handler — maps known errors to the envelope; hides internals in production. */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const isApi = err instanceof ApiError;
  const status = isApi ? err.status : err.name === 'ValidationError' ? 400 : 500;
  const message = isApi || status < 500 ? err.message : 'Internal server error';
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, error: { code: err.code ?? 'error', message } });
};

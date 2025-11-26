// backend/middleware/requestLogger.js
import morgan from 'morgan';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';

// Add unique request ID to each request
export const addRequestId = (req, res, next) => {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  next();
};

// Custom morgan token for request ID
morgan.token('reqId', (req) => req.id);
morgan.token('userId', (req) => req.user?.id || 'anon');

// Morgan stream to winston
const morganStream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Morgan middleware with custom format
export const httpLogger = morgan(
  ':reqId :method :url :status :res[content-length] - :response-time ms - userId::userId',
  { stream: morganStream }
);

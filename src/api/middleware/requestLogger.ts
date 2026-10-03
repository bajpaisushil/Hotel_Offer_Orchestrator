import { randomUUID } from 'node:crypto';
import { RequestHandler } from 'express';
import { logger } from '../../lib/logger';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

export const requestLogger: RequestHandler = (req, res, next) => {
  req.id = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('x-request-id', req.id);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const payload = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
    };

    if (res.statusCode >= 500) {
      logger.error(payload, 'request failed');
    } else if (res.statusCode >= 400) {
      logger.warn(payload, 'request rejected');
    } else {
      logger.info(payload, 'request completed');
    }
  });

  next();
};

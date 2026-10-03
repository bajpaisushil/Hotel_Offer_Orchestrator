import express, { Express } from 'express';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createHotelsRouter } from './routes/hotels';
import { createHealthRouter } from './routes/health';
import { createSupplierRouter } from './routes/suppliers';

export function createServer(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(requestLogger);

  app.use('/api', createHotelsRouter());
  app.use(createSupplierRouter());
  app.use(createHealthRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

import { createServer } from './server';
import { config } from '../config';
import { logger } from '../lib/logger';
import { closeRedis } from '../cache/redis';
import { closeTemporalClient } from '../temporal/client';

const app = createServer();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down api');

  server.close(async () => {
    await Promise.allSettled([closeRedis(), closeTemporalClient()]);
    logger.info('api stopped');
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: reason instanceof Error ? reason.message : String(reason) }, 'unhandled rejection');
});

import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../lib/logger';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;

  client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });

  client.on('error', (error: Error) => {
    logger.warn({ err: error.message }, 'redis connection error');
  });

  client.on('ready', () => {
    logger.info('redis connected');
  });

  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
  client = null;
}

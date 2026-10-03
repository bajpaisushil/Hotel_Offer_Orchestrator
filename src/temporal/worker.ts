import path from 'node:path';
import { NativeConnection, Runtime, Worker, DefaultLogger, LogEntry } from '@temporalio/worker';
import * as activities from './activities';
import { config } from '../config';
import { logger } from '../lib/logger';
import { closeRedis } from '../cache/redis';

function installRuntimeLogger(): void {
  Runtime.install({
    logger: new DefaultLogger('INFO', (entry: LogEntry) => {
      const level = entry.level.toLowerCase() as 'trace' | 'debug' | 'info' | 'warn' | 'error';
      const target = level === 'trace' ? 'trace' : level;
      logger[target]({ ...entry.meta }, entry.message);
    }),
  });
}

async function connectWithRetry(attempts = 12, delayMs = 2500): Promise<NativeConnection> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn({ attempt, attempts, reason }, 'temporal not ready, retrying');

      if (attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('unreachable');
}

async function main(): Promise<void> {
  installRuntimeLogger();

  const connection = await connectWithRetry();

  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    workflowsPath: path.join(__dirname, 'workflows'),
    activities,
  });

  logger.info(
    { taskQueue: config.TEMPORAL_TASK_QUEUE, namespace: config.TEMPORAL_NAMESPACE },
    'worker started',
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down worker');
    worker.shutdown();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await worker.run();

  await connection.close();
  await closeRedis();
  logger.info('worker stopped');
}

main().catch((error) => {
  logger.fatal({ err: error instanceof Error ? error.message : String(error) }, 'worker crashed');
  process.exit(1);
});

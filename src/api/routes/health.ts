import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { pingSupplier } from '../../suppliers/client';
import { pingRedis } from '../../cache/hotelCache';
import { pingTemporal } from '../../temporal/client';
import { SUPPLIER_LABELS } from '../../domain/types';

interface DependencyHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

async function probe(check: () => Promise<number>): Promise<DependencyHealth> {
  try {
    return { status: 'up', latencyMs: await check() };
  } catch (error) {
    return { status: 'down', error: error instanceof Error ? error.message : String(error) };
  }
}

export function createHealthRouter(): Router {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const [supplierA, supplierB, redis, temporal] = await Promise.all([
        probe(() => pingSupplier('A')),
        probe(() => pingSupplier('B')),
        probe(pingRedis),
        probe(pingTemporal),
      ]);

      const suppliersDown = [supplierA, supplierB].filter((item) => item.status === 'down').length;
      const infrastructureDown = redis.status === 'down' || temporal.status === 'down';

      let status: 'ok' | 'degraded' | 'down';
      if (infrastructureDown || suppliersDown === 2) {
        status = 'down';
      } else if (suppliersDown === 1) {
        status = 'degraded';
      } else {
        status = 'ok';
      }

      res.status(status === 'down' ? 503 : 200).json({
        status,
        uptimeSeconds: Math.round(process.uptime()),
        dependencies: {
          [SUPPLIER_LABELS.A]: supplierA,
          [SUPPLIER_LABELS.B]: supplierB,
          redis,
          temporal,
        },
      });
    }),
  );

  return router;
}

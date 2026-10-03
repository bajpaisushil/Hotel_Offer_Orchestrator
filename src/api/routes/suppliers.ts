import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { SUPPLIER_A_CATALOGUE, SUPPLIER_B_CATALOGUE, lookupCity } from '../../suppliers/catalogue';
import { SupplierHotel } from '../../domain/types';
import { config } from '../../config';

const LATENCY_MS: Record<string, number> = { A: 180, B: 120 };

const FORCED_DOWN: Record<string, boolean> = {
  A: config.SUPPLIER_A_FORCE_DOWN,
  B: config.SUPPLIER_B_FORCE_DOWN,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mountSupplier(router: Router, id: 'A' | 'B', catalogue: SupplierHotel[]): void {
  router.get(
    `/supplier${id}/hotels`,
    asyncHandler(async (req, res) => {
      await delay(LATENCY_MS[id] ?? 150);

      const requestedFailure = req.query.fail === '1' || req.query.fail === 'true';

      if (FORCED_DOWN[id] || requestedFailure) {
        res.status(503).json({
          error: {
            code: 'SUPPLIER_UNAVAILABLE',
            message: `Supplier ${id} is temporarily unavailable`,
          },
        });
        return;
      }

      const city = typeof req.query.city === 'string' ? req.query.city : '';
      const hotels = city ? lookupCity(catalogue, city) : catalogue;

      res.json(hotels);
    }),
  );
}

export function createSupplierRouter(): Router {
  const router = Router();
  mountSupplier(router, 'A', SUPPLIER_A_CATALOGUE);
  mountSupplier(router, 'B', SUPPLIER_B_CATALOGUE);
  return router;
}

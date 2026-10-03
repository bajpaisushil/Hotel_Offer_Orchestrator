import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { runHotelSearch } from '../../temporal/client';
import { readOffers } from '../../cache/hotelCache';
import { filterByPrice } from '../../domain/offers';
import { HotelOffer, SupplierId } from '../../domain/types';
import { logger } from '../../lib/logger';

const price = z.coerce.number().nonnegative().finite();

const querySchema = z
  .object({
    city: z.string().trim().min(1, 'city is required'),
    minPrice: price.optional(),
    maxPrice: price.optional(),
    simulateFailure: z
      .string()
      .transform((value) => value.split(',').map((part) => part.trim().toUpperCase()))
      .pipe(z.array(z.enum(['A', 'B'])).max(2))
      .optional(),
  })
  .refine(
    (value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice', path: ['minPrice'] },
  );

export function createHotelsRouter(): Router {
  const router = Router();

  router.get(
    '/hotels',
    asyncHandler(async (req, res) => {
      const { city, minPrice, maxPrice, simulateFailure } = querySchema.parse(req.query);

      const result = await runHotelSearch({
        city,
        simulateFailure: simulateFailure as SupplierId[] | undefined,
      });

      let offers: HotelOffer[];
      let source: 'redis' | 'workflow';

      if (result.cached) {
        offers = await readOffers(city, minPrice, maxPrice);
        source = 'redis';
      } else {
        offers = filterByPrice(result.offers, minPrice, maxPrice);
        source = 'workflow';
      }

      const degraded = result.suppliers.filter((supplier) => !supplier.ok);
      if (degraded.length > 0) {
        res.setHeader('x-degraded-suppliers', degraded.map((s) => s.supplier).join(', '));
        logger.warn(
          { requestId: req.id, city, degraded },
          'responding with partial supplier coverage',
        );
      }

      res.setHeader('x-result-source', source);
      res.json(offers);
    }),
  );

  return router;
}

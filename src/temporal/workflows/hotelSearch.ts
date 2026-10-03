import { ActivityFailure, ApplicationFailure, log, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';
import { selectBestOffers } from '../../domain/offers';
import {
  HotelSearchInput,
  HotelSearchResult,
  SUPPLIER_LABELS,
  SupplierFetchResult,
  SupplierId,
} from '../../domain/types';

const { fetchSupplierHotels } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: {
    initialInterval: '200ms',
    backoffCoefficient: 2,
    maximumInterval: '2 seconds',
    maximumAttempts: 3,
  },
});

const { persistOffers } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
  retry: {
    initialInterval: '200ms',
    backoffCoefficient: 2,
    maximumAttempts: 2,
  },
});

const SUPPLIERS: SupplierId[] = ['A', 'B'];

function describeFailure(error: unknown): string {
  if (error instanceof ActivityFailure && error.cause instanceof ApplicationFailure) {
    return error.cause.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function hotelSearchWorkflow(input: HotelSearchInput): Promise<HotelSearchResult> {
  const { city, simulateFailure = [] } = input;

  log.info('starting hotel search', { city, simulateFailure });

  const settled = await Promise.allSettled(
    SUPPLIERS.map(async (supplier): Promise<SupplierFetchResult> => {
      const startedAt = Date.now();
      const hotels = await fetchSupplierHotels(supplier, city, simulateFailure.includes(supplier));
      return { supplier, ok: true, hotels, durationMs: Date.now() - startedAt };
    }),
  );

  const results: SupplierFetchResult[] = settled.map((outcome, index) => {
    const supplier = SUPPLIERS[index] as SupplierId;

    if (outcome.status === 'fulfilled') {
      return outcome.value;
    }

    const reason = describeFailure(outcome.reason);
    log.warn('supplier call failed, continuing without it', { supplier, reason });
    return { supplier, ok: false, hotels: [], error: reason, durationMs: 0 };
  });

  if (results.every((result) => !result.ok)) {
    throw ApplicationFailure.nonRetryable(
      `All suppliers failed for city "${city}"`,
      'ALL_SUPPLIERS_DOWN',
      results.map((result) => `${SUPPLIER_LABELS[result.supplier]}: ${result.error}`),
    );
  }

  log.info('supplier fan-out complete', {
    city,
    timings: results.map((result) => ({
      supplier: result.supplier,
      ok: result.ok,
      durationMs: result.durationMs,
    })),
  });

  const offers = selectBestOffers(results);
  log.info('selected best offers', { city, offerCount: offers.length });

  let cached = true;
  try {
    await persistOffers(city, offers);
  } catch (error) {
    cached = false;
    log.error('failed to cache offers, serving from workflow result', {
      city,
      reason: describeFailure(error),
    });
  }

  return {
    city,
    offers,
    suppliers: results.map((result) => ({
      supplier: SUPPLIER_LABELS[result.supplier],
      ok: result.ok,
      hotelCount: result.hotels.length,
      durationMs: result.durationMs,
      ...(result.error ? { error: result.error } : {}),
    })),
    cached,
  };
}

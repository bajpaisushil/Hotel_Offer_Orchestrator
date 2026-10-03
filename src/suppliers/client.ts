import { z } from 'zod';
import { config } from '../config';
import { SupplierHotel, SupplierId } from '../domain/types';
import { UpstreamError } from '../lib/errors';

const hotelSchema = z.object({
  hotelId: z.string(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  city: z.string(),
  commissionPct: z.number().min(0).max(100),
});

const responseSchema = z.array(hotelSchema);

const SUPPLIER_URLS: Record<SupplierId, string> = {
  A: config.SUPPLIER_A_URL,
  B: config.SUPPLIER_B_URL,
};

export async function fetchFromSupplier(
  supplier: SupplierId,
  city: string,
  simulateFailure = false,
): Promise<SupplierHotel[]> {
  const url = new URL(SUPPLIER_URLS[supplier]);
  url.searchParams.set('city', city);
  if (simulateFailure) {
    url.searchParams.set('fail', '1');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.SUPPLIER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError(`Supplier ${supplier} timed out after ${config.SUPPLIER_TIMEOUT_MS}ms`);
    }
    throw new UpstreamError(`Supplier ${supplier} is unreachable`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new UpstreamError(`Supplier ${supplier} responded with HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => {
    throw new UpstreamError(`Supplier ${supplier} returned a malformed body`);
  });

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new UpstreamError(`Supplier ${supplier} returned an unexpected payload`, {
      issues: parsed.error.issues.slice(0, 5),
    });
  }

  return parsed.data;
}

export async function pingSupplier(supplier: SupplierId): Promise<number> {
  const url = new URL(SUPPLIER_URLS[supplier]);
  url.searchParams.set('city', '__healthcheck__');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.SUPPLIER_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new UpstreamError(`HTTP ${response.status}`);
    }
    await response.arrayBuffer();
    return Date.now() - startedAt;
  } finally {
    clearTimeout(timer);
  }
}

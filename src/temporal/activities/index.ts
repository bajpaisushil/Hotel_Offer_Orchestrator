import { Context } from '@temporalio/activity';
import { fetchFromSupplier } from '../../suppliers/client';
import { saveOffers } from '../../cache/hotelCache';
import { HotelOffer, SupplierHotel, SupplierId } from '../../domain/types';

export async function fetchSupplierHotels(
  supplier: SupplierId,
  city: string,
  simulateFailure = false,
): Promise<SupplierHotel[]> {
  const { log, info } = Context.current();
  log.info('fetching supplier hotels', { supplier, city, attempt: info.attempt });

  const hotels = await fetchFromSupplier(supplier, city, simulateFailure);

  log.info('supplier returned hotels', { supplier, city, count: hotels.length });
  return hotels;
}

export async function persistOffers(city: string, offers: HotelOffer[]): Promise<void> {
  const { log } = Context.current();

  await saveOffers(city, offers);

  log.info('offers written to redis', { city, count: offers.length });
}

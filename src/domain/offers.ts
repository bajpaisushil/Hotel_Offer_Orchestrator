import { HotelOffer, SUPPLIER_LABELS, SupplierFetchResult, SupplierHotel, SupplierId } from './types';

export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toOffer(hotel: SupplierHotel, supplier: SupplierId): HotelOffer {
  return {
    name: hotel.name.trim(),
    price: hotel.price,
    supplier: SUPPLIER_LABELS[supplier],
    commissionPct: hotel.commissionPct,
  };
}

function isBetter(candidate: HotelOffer, current: HotelOffer): boolean {
  if (candidate.price !== current.price) {
    return candidate.price < current.price;
  }
  return candidate.commissionPct > current.commissionPct;
}

export function selectBestOffers(results: SupplierFetchResult[]): HotelOffer[] {
  const bestByName = new Map<string, HotelOffer>();

  for (const result of results) {
    if (!result.ok) continue;

    for (const hotel of result.hotels) {
      const key = normaliseName(hotel.name);
      if (!key) continue;

      const offer = toOffer(hotel, result.supplier);
      const current = bestByName.get(key);

      if (!current || isBetter(offer, current)) {
        bestByName.set(key, offer);
      }
    }
  }

  return [...bestByName.values()].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

export function filterByPrice(
  offers: HotelOffer[],
  minPrice?: number,
  maxPrice?: number,
): HotelOffer[] {
  return offers.filter((offer) => {
    if (minPrice !== undefined && offer.price < minPrice) return false;
    if (maxPrice !== undefined && offer.price > maxPrice) return false;
    return true;
  });
}

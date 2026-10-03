import { describe, expect, it } from 'vitest';
import { filterByPrice, normaliseName, selectBestOffers } from '../src/domain/offers';
import { SupplierFetchResult, SupplierHotel } from '../src/domain/types';

function hotel(overrides: Partial<SupplierHotel> & { name: string; price: number }): SupplierHotel {
  return {
    hotelId: overrides.hotelId ?? `${overrides.name}-${overrides.price}`,
    city: overrides.city ?? 'delhi',
    commissionPct: overrides.commissionPct ?? 10,
    ...overrides,
  };
}

function result(
  supplier: 'A' | 'B',
  hotels: SupplierHotel[],
  ok = true,
): SupplierFetchResult {
  return { supplier, ok, hotels, durationMs: 100 };
}

describe('selectBestOffers', () => {
  it('keeps the cheaper offer when both suppliers list the same hotel', () => {
    const offers = selectBestOffers([
      result('A', [hotel({ name: 'Holtin', price: 6000, commissionPct: 10 })]),
      result('B', [hotel({ name: 'Holtin', price: 5340, commissionPct: 20 })]),
    ]);

    expect(offers).toEqual([
      { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
    ]);
  });

  it('keeps hotels that only one supplier returns', () => {
    const offers = selectBestOffers([
      result('A', [hotel({ name: 'Oberoi Gurgaon', price: 14200 })]),
      result('B', [hotel({ name: 'ITC Maurya', price: 11000 })]),
    ]);

    expect(offers.map((offer) => offer.name)).toEqual(['ITC Maurya', 'Oberoi Gurgaon']);
  });

  it('breaks a price tie by picking the higher commission', () => {
    const offers = selectBestOffers([
      result('A', [hotel({ name: 'Taj Palace', price: 12500, commissionPct: 8 })]),
      result('B', [hotel({ name: 'Taj Palace', price: 12500, commissionPct: 12 })]),
    ]);

    expect(offers[0]).toMatchObject({ supplier: 'Supplier B', commissionPct: 12 });
  });

  it('ignores results from a supplier that failed', () => {
    const offers = selectBestOffers([
      result('A', [hotel({ name: 'Radison', price: 5900 })]),
      result('B', [hotel({ name: 'Radison', price: 100 })], false),
    ]);

    expect(offers).toEqual([
      { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 10 },
    ]);
  });

  it('treats names that differ only by case or spacing as the same hotel', () => {
    const offers = selectBestOffers([
      result('A', [hotel({ name: 'Hyatt  Regency', price: 8700 })]),
      result('B', [hotel({ name: 'hyatt regency', price: 8100 })]),
    ]);

    expect(offers).toHaveLength(1);
    expect(offers[0]?.price).toBe(8100);
  });

  it('returns an empty list when every supplier failed', () => {
    const offers = selectBestOffers([
      result('A', [], false),
      result('B', [], false),
    ]);

    expect(offers).toEqual([]);
  });

  it('sorts the final list by price ascending', () => {
    const offers = selectBestOffers([
      result('A', [
        hotel({ name: 'Expensive', price: 9000 }),
        hotel({ name: 'Cheap', price: 1000 }),
      ]),
      result('B', [hotel({ name: 'Mid', price: 5000 })]),
    ]);

    expect(offers.map((offer) => offer.price)).toEqual([1000, 5000, 9000]);
  });
});

describe('filterByPrice', () => {
  const offers = [
    { name: 'Cheap', price: 1000, supplier: 'Supplier A', commissionPct: 10 },
    { name: 'Mid', price: 5000, supplier: 'Supplier B', commissionPct: 12 },
    { name: 'Expensive', price: 9000, supplier: 'Supplier A', commissionPct: 8 },
  ];

  it('includes offers sitting exactly on the bounds', () => {
    expect(filterByPrice(offers, 1000, 5000).map((offer) => offer.name)).toEqual(['Cheap', 'Mid']);
  });

  it('treats a missing bound as unbounded', () => {
    expect(filterByPrice(offers, undefined, 5000)).toHaveLength(2);
    expect(filterByPrice(offers, 5000, undefined)).toHaveLength(2);
    expect(filterByPrice(offers)).toHaveLength(3);
  });

  it('returns nothing when the range matches no offer', () => {
    expect(filterByPrice(offers, 6000, 8000)).toEqual([]);
  });
});

describe('normaliseName', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normaliseName('  The   Leela  ')).toBe('the leela');
  });
});

export type SupplierId = 'A' | 'B';

export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface HotelOffer {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}

export interface SupplierFetchResult {
  supplier: SupplierId;
  ok: boolean;
  hotels: SupplierHotel[];
  error?: string;
  durationMs: number;
}

export interface HotelSearchInput {
  city: string;
  simulateFailure?: SupplierId[];
}

export interface HotelSearchResult {
  city: string;
  offers: HotelOffer[];
  suppliers: Array<{
    supplier: string;
    ok: boolean;
    hotelCount: number;
    durationMs: number;
    error?: string;
  }>;
  cached: boolean;
}

export const SUPPLIER_LABELS: Record<SupplierId, string> = {
  A: 'Supplier A',
  B: 'Supplier B',
};

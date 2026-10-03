import { SupplierHotel } from '../domain/types';

export const SUPPLIER_A_CATALOGUE: SupplierHotel[] = [
  { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
  { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
  { hotelId: 'a3', name: 'Taj Palace', price: 12500, city: 'delhi', commissionPct: 8 },
  { hotelId: 'a4', name: 'Leela Kempinski', price: 9800, city: 'delhi', commissionPct: 11 },
  { hotelId: 'a5', name: 'Oberoi Gurgaon', price: 14200, city: 'delhi', commissionPct: 9 },
  { hotelId: 'a6', name: 'Trident Nariman', price: 11200, city: 'mumbai', commissionPct: 10 },
  { hotelId: 'a7', name: 'Sea Grand', price: 7400, city: 'mumbai', commissionPct: 12 },
  { hotelId: 'a8', name: 'Colaba Residency', price: 4300, city: 'mumbai', commissionPct: 18 },
  { hotelId: 'a9', name: 'Candolim Beach Resort', price: 5200, city: 'goa', commissionPct: 14 },
  { hotelId: 'a10', name: 'Palm Cove', price: 6100, city: 'goa', commissionPct: 11 },
];

export const SUPPLIER_B_CATALOGUE: SupplierHotel[] = [
  { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
  { hotelId: 'b2', name: 'Radison', price: 6150, city: 'delhi', commissionPct: 15 },
  { hotelId: 'b3', name: 'Taj Palace', price: 12500, city: 'delhi', commissionPct: 12 },
  { hotelId: 'b4', name: 'ITC Maurya', price: 11000, city: 'delhi', commissionPct: 14 },
  { hotelId: 'b5', name: 'Hyatt Regency', price: 8700, city: 'delhi', commissionPct: 10 },
  { hotelId: 'b6', name: 'Trident Nariman', price: 10750, city: 'mumbai', commissionPct: 9 },
  { hotelId: 'b7', name: 'Sea Grand', price: 7850, city: 'mumbai', commissionPct: 16 },
  { hotelId: 'b8', name: 'Marine Bay Suites', price: 6900, city: 'mumbai', commissionPct: 13 },
  { hotelId: 'b9', name: 'Palm Cove', price: 5750, city: 'goa', commissionPct: 13 },
];

export function lookupCity(catalogue: SupplierHotel[], city: string): SupplierHotel[] {
  const target = city.trim().toLowerCase();
  return catalogue.filter((hotel) => hotel.city === target);
}

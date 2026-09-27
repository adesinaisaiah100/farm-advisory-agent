import type { AgroStore } from '@poultry/schemas';

const UPDATED_AT = '2026-09-20T00:00:00.000Z';

// No store in this seed has confirmed its stock with us, so no store carries a stock list.
// Inventory arrives only when a real partner opts in and supplies stockVerifiedAt.
export const STORES: AgroStore[] = [
  {
    id: 'e652b23f-7eeb-4828-a5f1-68671f10197c',
    name: 'Adaeze Agro Vet',
    phone: '+2348012345678',
    state: 'Oyo',
    lga: 'Ibadan North',
    updatedAt: UPDATED_AT,
  },
  {
    id: 'a08f708f-d883-43c9-bf7b-9738bde3d4dc',
    name: 'GreenField Vet Supplies',
    phone: '+2348023456789',
    state: 'Lagos',
    lga: 'Ojo',
    updatedAt: UPDATED_AT,
  },
  {
    id: '291e9fc5-8402-4d98-b789-36cfe2396616',
    name: 'Sunrise Agro Store',
    phone: '+2348034567890',
    state: 'Kaduna',
    lga: 'Kaduna North',
    updatedAt: UPDATED_AT,
  },
  {
    id: '7f6c4571-3e98-48bf-ae76-d83374662b38',
    name: 'FarmCare Supplies',
    phone: '+2348045678901',
    state: 'Enugu',
    lga: 'Enugu North',
    updatedAt: UPDATED_AT,
  },
  {
    id: 'f5b4f698-0b75-45ea-bdfb-42ec5177c968',
    name: 'PoultryPlus Depot',
    phone: '+2348056789012',
    state: 'Ogun',
    lga: 'Abeokuta North',
    updatedAt: UPDATED_AT,
  },
  {
    id: '52846ca9-5b29-46e3-8659-b5cf53c963e7',
    name: 'Hope Agro Vet',
    phone: '+2348067890123',
    state: 'Plateau',
    lga: 'Jos North',
    updatedAt: UPDATED_AT,
  },
  {
    id: '1b9d8c07-6e3a-4d1f-9e6a-2c4b6d8e0f13',
    name: 'Ojo Agro Depot',
    phone: '+2348078901234',
    state: 'Lagos',
    lga: 'Ojo',
    updatedAt: UPDATED_AT,
  },
];

export function getStores(): AgroStore[] {
  return STORES.map((store) => ({ ...store }));
}

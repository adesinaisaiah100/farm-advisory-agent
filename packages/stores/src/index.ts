import { z } from 'zod';

export const AgroStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  lga: z.string(),
  state: z.string(),
  phone: z.string(),
  hasStock: z.array(z.string()),
});

export type AgroStore = z.infer<typeof AgroStoreSchema>;

export function hasItem(store: AgroStore, item: string): boolean {
  return store.hasStock.includes(item.toLowerCase());
}
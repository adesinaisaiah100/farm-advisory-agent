import { z } from 'zod';
import { UuidSchema } from '../common.js';
import { PhoneSchema } from '../phone/index.js';

export const StockSchema = z.array(z.string().min(1));

export const StoreSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  phone: PhoneSchema,
  state: z.string().min(1),
  lga: z.string().min(1),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  stock: StockSchema,
  isOpen: z.boolean().default(true),
  updatedAt: z.string().datetime(),
});

export type AgroStore = z.infer<typeof StoreSchema>;
import { z } from 'zod';
import { PhoneSchema } from '../phone/index.js';

export const SpeciesSchema = z.enum(['broiler', 'layer', 'cockerel', 'mixed', 'unknown']);

export type Species = z.infer<typeof SpeciesSchema>;

export const LocationSchema = z.object({
  lga: z.string().min(1, 'LGA is required'),
  state: z.string().min(1, 'state is required'),
});

export type Location = z.infer<typeof LocationSchema>;

export const FarmerSchema = z.object({
  phone: PhoneSchema,
  name: z.string().min(1).optional(),
  location: LocationSchema.optional(),
  farmSize: z.number().int().min(200).max(2000).optional(),
  species: SpeciesSchema.optional(),
});

export type Farmer = z.infer<typeof FarmerSchema>;

export const MIDDLE_TIER_MIN = 200;
export const MIDDLE_TIER_MAX = 2000;

export function isMiddleTier(farmSize: number | undefined): boolean {
  return farmSize !== undefined && farmSize >= MIDDLE_TIER_MIN && farmSize <= MIDDLE_TIER_MAX;
}
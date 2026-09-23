import { z } from 'zod';

export const PhoneSchema = z
  .string()
  .regex(/^(?:\+?[1-9]\d{7,14}|0\d{10})$/, 'must be a valid Nigerian phone number');

export type Phone = z.infer<typeof PhoneSchema>;

export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+234')) {
    return digits.startsWith('+2340') ? '+234' + digits.slice(5) : digits;
  }
  if (digits.startsWith('234') && digits.length === 13) {
    return '+' + digits;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return '+234' + digits.slice(1);
  }
  return '+' + digits;
}

export const FarmerSchema = z.object({
  phone: PhoneSchema,
  name: z.string().optional(),
  location: z.object({ lga: z.string(), state: z.string() }).optional(),
  farmSize: z.number().int().nonnegative().optional(),
  species: z.enum(['broiler', 'layer', 'cockerel', 'mixed', 'unknown']).optional(),
});

export type Farmer = z.infer<typeof FarmerSchema>;

export function parseFarmer(input: unknown): Farmer {
  return FarmerSchema.parse(input);
}

export function safeParseFarmer(input: unknown) {
  return FarmerSchema.safeParse(input);
}
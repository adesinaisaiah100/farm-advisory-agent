import { z } from 'zod';

const NIGERIA_LANDLINE = '0\\d{10}';
const E164_LIKE = '\\+?[1-9]\\d{7,14}';

export const PhoneSchema = z
  .string()
  .regex(new RegExp(`^(?:${E164_LIKE}|${NIGERIA_LANDLINE})$`), 'must be a valid phone number');

export type Phone = z.infer<typeof PhoneSchema>;

export const PHONE_REGEX = new RegExp(`^(?:${E164_LIKE}|${NIGERIA_LANDLINE})$`);

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

export function isValidPhone(input: string): boolean {
  return PHONE_REGEX.test(input) || PHONE_REGEX.test(normalizePhone(input));
}
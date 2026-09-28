import { PhoneSchema } from '@poultry/schemas';

/**
 * An unpaired bridge answers every number that messages it, which for a veterinary agent means answering
 * strangers. The allowlist is the boundary; an empty list is refused rather than treated as "everyone",
 * so a missing env var fails closed instead of opening the channel.
 */
export function parseAllowedFrom(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => PhoneSchema.safeParse(entry).success);
}

export function isFarmerAllowed(phone: string, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return false;
  return allowed.includes(phone);
}

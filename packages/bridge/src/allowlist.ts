import { PhoneSchema } from '@poultry/schemas';

/**
 * When `BRIDGE_ALLOWED_FROM` is set to a comma-separated list of E.164 numbers,
 * only those numbers are served. Leave the variable unset (or empty) to accept
 * messages from any number — the default for an open pilot.
 *
 * Historical note: the list previously failed-closed (empty = answer nobody).
 * That was the right call during private development. With the bot entering
 * a real-farmer pilot phase the default is now open; an explicit list still
 * restricts to a named set of testers when needed.
 */
export function parseAllowedFrom(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => PhoneSchema.safeParse(entry).success);
}

export function isFarmerAllowed(phone: string, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true; // open pilot — no restriction
  return allowed.includes(phone);
}

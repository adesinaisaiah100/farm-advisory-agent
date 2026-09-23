import type { Farmer } from '@poultry/schemas';

export function greeting(farmer: Farmer | undefined): string {
  return farmer?.name ? `Hello ${farmer.name}!` : 'Hello!';
}
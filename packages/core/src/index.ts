export * from './language.js';
export * from './llm.js';
export * from './merge.js';
export * from './missing.js';
export * from './orchestrator.js';
export * from './providers.js';
export * from './slip.js';
export * from './validate.js';

import type { Farmer } from '@poultry/schemas';

export function greeting(farmer: Farmer | undefined): string {
  return farmer?.name ? `Hello ${farmer.name}!` : 'Hello!';
}
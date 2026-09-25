import type { CaseData } from '@poultry/schemas';
import type { CaseField } from './merge.js';

export const REQUIRED_CASE_FIELDS = ['species', 'symptoms', 'onsetDays', 'mortalityCount'] as const;

type RequiredField = (typeof REQUIRED_CASE_FIELDS)[number];

function hasPresent(c: CaseData, field: RequiredField): boolean {
  switch (field) {
    case 'species':
      return c.species !== undefined && c.species !== 'unknown';
    case 'symptoms':
      return (c.symptoms?.length ?? 0) > 0;
    case 'onsetDays':
      return c.onsetDays !== undefined && c.onsetDays > 0;
    case 'mortalityCount':
      return c.mortalityCount !== undefined && c.mortalityCount >= 0;
  }
}

export function missing(c: CaseData): string[] {
  return REQUIRED_CASE_FIELDS.filter((field) => !hasPresent(c, field));
}

export function isComplete(c: CaseData): boolean {
  return missing(c).length === 0;
}

export function isMissing(c: CaseData, field: CaseField): boolean {
  return missing(c).includes(field);
}
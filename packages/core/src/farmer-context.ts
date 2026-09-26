import type { CaseSnapshot, Farmer } from '@poultry/schemas';
import type { ReplyLanguage } from './language.js';

export const MAX_PROFILE_DIGEST_TOKENS = 90;
export const MAX_OPEN_CASE_TOKENS = 60;
export const MAX_INJECTED_CONTEXT_TOKENS = MAX_PROFILE_DIGEST_TOKENS + MAX_OPEN_CASE_TOKENS;

const LANGUAGE_LABEL: Record<ReplyLanguage, string> = {
  pidgin: 'reply in pidgin',
  english: 'reply in english',
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ProfileView {
  name?: string;
  lga?: string;
  farmSize?: number;
  species?: string;
  breed?: string;
  language?: ReplyLanguage;
}

export function profileDigest(p: ProfileView): string {
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  if (p.lga) parts.push(p.lga);
  if (p.farmSize !== undefined) parts.push(`${p.farmSize} birds`);
  if (p.species) parts.push(p.species);
  if (p.breed) parts.push(`breed ${p.breed}`);
  if (p.language) parts.push(LANGUAGE_LABEL[p.language]);
  return parts.join(' · ');
}

export function profileView(farmer: Farmer | undefined, language: ReplyLanguage): ProfileView {
  if (!farmer) return { language };
  return {
    name: farmer.name,
    lga: farmer.location?.lga,
    farmSize: farmer.farmSize,
    species: farmer.species,
    breed: farmer.breed,
    language,
  };
}

export function openCasePointer(c: CaseSnapshot): string {
  const bits: string[] = [`#${c.id}`];
  if (c.species) bits.push(c.species);
  if (c.onsetDays !== undefined) bits.push(`onset ${c.onsetDays}d`);
  if (c.mortalityCount !== undefined) bits.push(`${c.mortalityCount} dead`);
  if (c.diseaseText) bits.push(c.diseaseText);
  bits.push(c.status);
  return `OPEN CASE ${bits.join(' · ')}`;
}

export function injectedContext(
  farmer: Farmer | undefined,
  openCase: CaseSnapshot | undefined,
  language: ReplyLanguage,
): string {
  const lines: string[] = [];
  const digest = profileDigest(profileView(farmer, language));
  if (digest) lines.push(digest);
  if (openCase) lines.push(openCasePointer(openCase));
  return lines.join('\n');
}
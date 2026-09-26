import { describe, expect, it } from 'vitest';
import type { CaseSnapshot, Farmer } from '@poultry/schemas';
import {
  estimateTokens,
  injectedContext,
  MAX_INJECTED_CONTEXT_TOKENS,
  MAX_OPEN_CASE_TOKENS,
  MAX_PROFILE_DIGEST_TOKENS,
  openCasePointer,
  profileDigest,
  profileView,
} from './farmer-context.js';

const farmer: Farmer = {
  phone: '+2348012345678',
  name: 'Adaeze',
  location: { lga: 'Jos North', state: 'Plateau' },
  farmSize: 800,
  species: 'layer',
  breed: 'Isa Brown',
};

const openCase: CaseSnapshot = {
  id: '3f2a0a40-b6e0-4a90-9a63-85a8e8b4f4f1',
  species: 'broiler',
  onsetDays: 3,
  mortalityCount: 3,
  diseaseText: 'coccidiosis',
  status: 'in_progress',
};

describe('profileDigest', () => {
  it('renders a full profile as one compact line', () => {
    expect(
      profileDigest({ name: 'Adaeze', lga: 'Jos North', farmSize: 800, species: 'layer', breed: 'Isa Brown', language: 'pidgin' }),
    ).toBe('Adaeze · Jos North · 800 birds · layer · breed Isa Brown · reply in pidgin');
  });

  it('omits absent profile fields', () => {
    expect(profileDigest({ farmSize: 200 })).toBe('200 birds');
  });

  it('renders an empty profile as an empty string', () => {
    expect(profileDigest({})).toBe('');
  });

  it('stays within the profile token cap', () => {
    const digest = profileDigest(profileView(farmer, 'pidgin'));
    expect(estimateTokens(digest)).toBeLessThanOrEqual(MAX_PROFILE_DIGEST_TOKENS);
  });
});

describe('profileView', () => {
  it('maps a farmer to the digest view', () => {
    expect(profileView(farmer, 'pidgin')).toEqual({
      name: 'Adaeze',
      lga: 'Jos North',
      farmSize: 800,
      species: 'layer',
      breed: 'Isa Brown',
      language: 'pidgin',
    });
  });

  it('keeps the reply language for an unknown farmer', () => {
    expect(profileView(undefined, 'english')).toEqual({ language: 'english' });
  });
});

describe('openCasePointer', () => {
  it('renders an open episode as one line', () => {
    expect(openCasePointer(openCase)).toBe(
      'OPEN CASE #3f2a0a40-b6e0-4a90-9a63-85a8e8b4f4f1 · broiler · onset 3d · 3 dead · coccidiosis · in_progress',
    );
  });

  it('stays within the open-case token cap', () => {
    expect(estimateTokens(openCasePointer(openCase))).toBeLessThanOrEqual(MAX_OPEN_CASE_TOKENS);
  });
});

describe('injectedContext', () => {
  it('combines the digest and the open-case pointer', () => {
    const context = injectedContext(farmer, openCase, 'pidgin');
    expect(context).toContain('Adaeze · Jos North');
    expect(context).toContain('OPEN CASE #3f2a0a40');
  });

  it('omits the pointer when there is no open episode', () => {
    expect(injectedContext(farmer, undefined, 'pidgin')).not.toContain('OPEN CASE');
  });

  it('stays within the combined injected-context cap', () => {
    expect(estimateTokens(injectedContext(farmer, openCase, 'pidgin'))).toBeLessThanOrEqual(MAX_INJECTED_CONTEXT_TOKENS);
  });
});
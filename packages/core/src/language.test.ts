import { describe, expect, it } from 'vitest';
import { classifyLanguage, replyLanguageFor } from './language.js';

describe('classifyLanguage', () => {
  it('detects a clear pidgin message', () => {
    expect(classifyLanguage('My birds dey die o, abeg help me')).toBe('pidgin');
  });

  it('detects otoro pidgin phrasing', () => {
    expect(classifyLanguage('Wetin you dey talk? No be so e dey be')).toBe('pidgin');
  });

  it('detects a clear english message', () => {
    expect(classifyLanguage('My birds are dying, please help me')).toBe('english');
  });

  it('detects formal english', () => {
    expect(classifyLanguage('I am seeing signs of diarrhea and they are not eating')).toBe('english');
  });

  it('defaults to unknown for a short neutral message', () => {
    expect(classifyLanguage('ok')).toBe('unknown');
  });

  it('defaults to unknown for numbers only', () => {
    expect(classifyLanguage('50')).toBe('unknown');
  });

  it('handles empty text as unknown', () => {
    expect(classifyLanguage('')).toBe('unknown');
  });

  it('detects explicit pidgin switch commands', () => {
    expect(classifyLanguage('pidgin')).toBe('pidgin');
    expect(classifyLanguage('speak pidgin')).toBe('pidgin');
    expect(classifyLanguage('switch to pidgin')).toBe('pidgin');
    expect(classifyLanguage('broken english')).toBe('pidgin');
  });

  it('detects explicit english switch commands', () => {
    expect(classifyLanguage('english')).toBe('english');
    expect(classifyLanguage('speak english')).toBe('english');
    expect(classifyLanguage('switch to english')).toBe('english');
  });
});

describe('replyLanguageFor', () => {
  it('returns pidgin only when pidgin is detected', () => {
    expect(replyLanguageFor('pidgin')).toBe('pidgin');
  });

  it('defaults unknown to english', () => {
    expect(replyLanguageFor('unknown')).toBe('english');
  });

  it('maps english to english', () => {
    expect(replyLanguageFor('english')).toBe('english');
  });
});
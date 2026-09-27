import { describe, expect, it } from 'vitest';
import { splitSentences } from './sentences.js';

describe('splitSentences', () => {
  it('splits on terminal punctuation', () => {
    expect(splitSentences('Birds stop eating. Respiratory signs follow. Isolate the flock.')).toEqual([
      'Birds stop eating.',
      'Respiratory signs follow.',
      'Isolate the flock.',
    ]);
  });

  it('keeps decimals intact', () => {
    expect(splitSentences('Mortality reached 1.5% within 48 hours.')).toEqual([
      'Mortality reached 1.5% within 48 hours.',
    ]);
  });

  it('keeps a lower-case continuation with its sentence', () => {
    expect(splitSentences('See the annex, e.g. the withdrawal table. Then act.')).toEqual([
      'See the annex, e.g. the withdrawal table.',
      'Then act.',
    ]);
  });

  it('does not split on a known abbreviation', () => {
    expect(splitSentences('Dehydration vs. Newcastle disease must be separated.')).toEqual([
      'Dehydration vs. Newcastle disease must be separated.',
    ]);
  });

  it('keeps trailing quotes with the sentence they close', () => {
    expect(splitSentences('The guide says "isolate now." Do it today.')).toEqual([
      'The guide says "isolate now."',
      'Do it today.',
    ]);
  });

  it('returns one sentence when there is no terminator', () => {
    expect(splitSentences('no terminator here')).toEqual(['no terminator here']);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n  ')).toEqual([]);
  });

  it('normalises the whitespace inside a sentence', () => {
    expect(splitSentences('Water   and\nfeed must  both change.')).toEqual([
      'Water and feed must both change.',
    ]);
  });
});

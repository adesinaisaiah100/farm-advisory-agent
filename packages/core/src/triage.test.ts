import { describe, expect, it } from 'vitest';
import type { CaseData } from '@poultry/schemas';
import { assessTriage, CONFIRM_ACTION, MAX_TRIAGE_TURNS, triageReply } from './triage.js';

function baseCase(overrides: Partial<CaseData> = {}): CaseData {
  return {
    species: 'broiler',
    symptoms: ['diarrhoea'],
    onsetDays: 2,
    mortalityCount: 3,
    farmSize: 500,
    status: 'in_progress',
    ...overrides,
  };
}

describe('assessTriage', () => {
  it('confirms a single confident diagnosis', () => {
    const t = assessTriage(baseCase({ diseaseHits: ['coccidiosis'] }));
    expect(t.band).toBe('confirmable');
    expect(t.differential).toEqual(['coccidiosis']);
    expect(t.discriminator).toBeUndefined();
  });

  it('is ambiguous when the model names two look-alikes', () => {
    const t = assessTriage(baseCase({ diseaseHits: ['newcastle', 'infectious_bronchitis'] }));
    expect(t.band).toBe('ambiguous');
    expect(t.pairedWith).toBe('infectious_bronchitis');
    expect(t.discriminator?.english).toContain('neck');
  });

  it('is ambiguous when the model names any two diseases, known pair or not', () => {
    const t = assessTriage(baseCase({ diseaseHits: ['gumboro', 'coccidiosis'] }));
    expect(t.band).toBe('ambiguous');
    expect(t.pairedWith).toBe('coccidiosis');
  });

  it('is ambiguous whenever the model flags a field as unconfirmed', () => {
    const t = assessTriage(
      baseCase({ diseaseHits: ['coccidiosis'], needsConfirmation: ['diseaseHits'] }),
    );
    expect(t.band).toBe('ambiguous');
  });

  it('ignores an unknown hit when judging confidence', () => {
    const t = assessTriage(baseCase({ diseaseHits: ['unknown'] }));
    expect(t.band).toBe('confirmable');
    expect(t.differential).toEqual([]);
  });

  it('asks a generic question when the model is unsure but names nothing', () => {
    const t = assessTriage(baseCase({ needsConfirmation: ['diseaseHits'] }));
    expect(t.band).toBe('ambiguous');
    expect(t.discriminator?.pidgin).toContain('separate');
  });

  it('treats a red flag as red no matter what the model diagnosed', () => {
    const t = assessTriage(baseCase({ symptoms: ['neck dey bend'], diseaseHits: ['coccidiosis'] }));
    expect(t.band).toBe('red_flag');
    expect(t.redFlags).toContain('neck_sign');
  });

  it('treats suspected avian influenza as red even with no red-flag symptom', () => {
    const t = assessTriage(baseCase({ diseaseHits: ['avian_influenza'] }));
    expect(t.band).toBe('red_flag');
    expect(t.differential).toContain('avian_influenza');
  });

  it('reads bloody droppings as a coccidiosis differential, not a red flag', () => {
    const t = assessTriage(baseCase({ symptoms: ['blood in droppings'] }));
    expect(t.band).toBe('confirmable');
    expect(t.differential).toContain('coccidiosis');
    expect(t.redFlags).toEqual([]);
  });

  it('keeps coccidiosis ambiguous when the model also offers necrotic enteritis', () => {
    const t = assessTriage(
      baseCase({
        symptoms: ['droppings dey dark and watery'],
        diseaseHits: ['coccidiosis', 'necrotic_enteritis'],
      }),
    );
    expect(t.band).toBe('ambiguous');
    expect(t.pairedWith).toBe('necrotic_enteritis');
  });

  it('offers a confirm action on every band', () => {
    const cases: Array<Partial<CaseData>> = [
      { symptoms: ['neck dey bend'] },
      { diseaseHits: ['newcastle', 'infectious_bronchitis'] },
      { diseaseHits: ['gumboro'] },
    ];
    for (const band of cases) {
      expect(assessTriage(baseCase(band)).confirmAction).toBe(CONFIRM_ACTION);
    }
  });
});

describe('triageReply', () => {
  it('opens by admitting the diagnosis is not settled', () => {
    const reply = triageReply(
      assessTriage(baseCase({ diseaseHits: ['newcastle', 'infectious_bronchitis'] })),
      'english',
    );
    expect(reply).toContain('not 100% sure');
    expect(reply).toContain('will not guess');
  });

  it('includes the discriminating question and the confirm action in the farmer language', () => {
    const t = assessTriage(baseCase({ diseaseHits: ['coccidiosis', 'necrotic_enteritis'] }));
    const reply = triageReply(t, 'pidgin');
    expect(reply).toContain('blood');
    expect(reply).toContain('post-mortem');
  });

  it('does not re-ask if droppings have blood when blood was already reported', () => {
    const t = assessTriage(
      baseCase({
        symptoms: ['blood in droppings'],
        diseaseHits: ['coccidiosis', 'necrotic_enteritis'],
      }),
    );
    const reply = triageReply(t, 'pidgin');
    expect(reply).toContain('Since blood already dey the shit');
    expect(reply).not.toContain('Di droppings get blood, or na dark');
  });
});

describe('MAX_TRIAGE_TURNS', () => {
  it('is a low bound so an unresolvable case reaches a vet', () => {
    expect(MAX_TRIAGE_TURNS).toBeLessThanOrEqual(2);
  });
});

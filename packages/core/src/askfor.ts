import type { CaseData, Disease } from '@poultry/schemas';
import { assessTriage } from './triage.js';

export interface AskFor {
  product: string;
  why: string;
  askTheSeller: string[];
  refuse: string[];
  needsVet: boolean;
}

export const COUNTERFEIT_GUARD: readonly string[] = [
  'anything without a NAFDAC number printed on the pack',
  'medicine decanted into a loose unlabelled bottle',
  'a sale with no written receipt, because you cannot trace a bad batch',
];

const RESISTANCE_WARNING =
  'a general antibiotic "just in case" — resistance is documented in Nigerian poultry, and it does not treat this';

const VACCINE_COLD_CHAIN =
  'a vaccine kept out of the cold chain — a bad vaccine is worse than no vaccine';

const VACCINE_QUESTIONS: readonly string[] = [
  'is the cold chain intact from that counter to my farm? A vaccine that lost its cold will not work',
  'who is allowed to administer it — a vet or my own staff?',
  'what is the batch number, the expiry date, and is it registered with NAFDAC?',
];

const ASK_FOR: Partial<Record<Disease, Omit<AskFor, 'refuse'> & { refuse?: readonly string[] }>> = {
  coccidiosis: {
    product: 'an anticoccidial — ask whether it is amprolium or diclazuril, not an antibiotic',
    why: 'blood-stained droppings in young birds fit coccidiosis, and an anticoccidial is the class that treats it',
    askTheSeller: [
      'which one is it, and how much per 100 birds at this weight?',
      'how many days do I withdraw before I eat the eggs or sell the birds?',
      'is the batch registered with NAFDAC, and what is the expiry date?',
    ],
    refuse: ['a coccidial mixed into the feed with no stated dose'],
    needsVet: false,
  },
  newcastle: {
    product: 'a Newcastle vaccine — ask which strain, live or killed, and who administers it',
    why: 'the signs fit Newcastle disease, which is viral, so only vaccination and biosecurity address it',
    askTheSeller: [
      'which vaccine strain is it, and is it the strain circulating in this area?',
      ...VACCINE_QUESTIONS,
    ],
    refuse: [
      'an antibiotic sold as a cure for Newcastle — no antibiotic cures a virus, it only hides secondary infection',
    ],
    needsVet: true,
  },
  infectious_bronchitis: {
    product: 'an infectious bronchitis vaccine, plus electrolytes for the air passages',
    why: 'sneezing and watery eyes with no neck or gut signs fit bronchitis, not Newcastle',
    askTheSeller: ['which IB vaccine strain, and at what age do I give it?', ...VACCINE_QUESTIONS],
    refuse: ['an antibiotic sold as a cure for a virus'],
    needsVet: true,
  },
  gumboro: {
    product: 'a Gumboro (infectious bursal disease) vaccine',
    why: 'profuse watery droppings in young birds fit Gumboro, which is a virus',
    askTheSeller: [
      'which age window is this vaccine for? Gumboro given at the wrong age does not protect the flock',
      ...VACCINE_QUESTIONS,
    ],
    refuse: [VACCINE_COLD_CHAIN],
    needsVet: true,
  },
  fowlpox: {
    product: 'a fowl pox vaccine',
    why: 'scabby lesions around the eye and on the comb fit fowl pox',
    askTheSeller: [
      'is it given by injection or in the drinking water, and at what age?',
      ...VACCINE_QUESTIONS,
    ],
    refuse: [VACCINE_COLD_CHAIN],
    needsVet: true,
  },
  necrotic_enteritis: {
    product:
      'nothing to buy yet — necrotic enteritis needs a vet to confirm, because it looks like coccidiosis',
    why: 'dark watery droppings with no blood point to necrotic enteritis, and the antibiotic choice for it is a vet decision',
    askTheSeller: [
      'which antibiotic would you use for a Clostridium case, and what is the withdrawal period?',
    ],
    refuse: [RESISTANCE_WARNING],
    needsVet: true,
  },
};

export function askFor(c: CaseData): AskFor | undefined {
  const { differential } = assessTriage(c);
  if (differential.includes('avian_influenza')) return undefined;
  for (const disease of differential) {
    const entry = ASK_FOR[disease];
    if (entry === undefined) continue;
    return {
      ...entry,
      refuse: [...(entry.refuse ?? []), RESISTANCE_WARNING, ...COUNTERFEIT_GUARD],
    };
  }
  return undefined;
}

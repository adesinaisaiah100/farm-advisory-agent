import type { CaseData, Disease } from '@poultry/schemas';
import { matchesConcepts, redFlagsFor } from '@poultry/schemas';

export type ConfidenceBand = 'red_flag' | 'ambiguous' | 'confirmable';

export const MAX_TRIAGE_TURNS = 2;

export const MASS_MORTALITY_PCT = 30;

export interface Bilingual {
  english: string;
  pidgin: string;
}

export interface Triage {
  band: ConfidenceBand;
  redFlags: string[];
  differential: Disease[];
  pairedWith: Disease | undefined;
  discriminator: Bilingual | undefined;
  confirmAction: Bilingual;
}

const CONFUSION_PARTNERS: Partial<Record<Disease, readonly Disease[]>> = {
  newcastle: ['infectious_bronchitis', 'avian_influenza'],
  infectious_bronchitis: ['newcastle'],
  avian_influenza: ['newcastle'],
  coccidiosis: ['necrotic_enteritis'],
  necrotic_enteritis: ['coccidiosis'],
};

const DISCRIMINATOR: Partial<Record<Disease, Bilingual>> = {
  newcastle: {
    english:
      'Is the neck twisting with greenish watery droppings, or is it mainly sneezing and watery eyes with a normal neck? Newcastle hits the nervous system and the gut; infectious bronchitis stays in the air passages.',
    pidgin:
      'Na di neck dey twist and di droppings be greenish, or na mainly sneeze and eye dey water while di neck normal? Newcastle dey attack di nerve and di belle; bronchitis dey attack di airway.',
  },
  infectious_bronchitis: {
    english:
      'Sneezing and watery eyes with no neck twisting, or greenish droppings and a twisted neck? Newcastle shows the neck and gut signs; IB mostly shows the air passages.',
    pidgin:
      'Sneeze and eye dey water without neck twist, or na greenish droppings and neck twist? Newcastle na neck and belle signs; IB na mostly airway.',
  },
  coccidiosis: {
    english:
      'Are the droppings blood-stained, or dark and watery with no blood? Bloody droppings in young birds point to coccidiosis; dark watery droppings without blood point to necrotic enteritis.',
    pidgin:
      'Di droppings get blood, or na dark and watery without blood? Blood for coccidiosis; dark watery without blood na more like necrotic enteritis.',
  },
  necrotic_enteritis: {
    english:
      'Dark watery droppings with no blood, or blood-stained droppings? No blood points to necrotic enteritis; blood in young birds points to coccidiosis.',
    pidgin:
      'Dark watery droppings without blood, or na di droppings get blood? Without blood na more like necrotic enteritis; blood for young birds na coccidiosis.',
  },
  avian_influenza: {
    english:
      'Did birds die within a day of looking sick with dark or blue combs, or did deaths creep over three to five days? Sudden death with a dark comb is the emergency pattern; a slow creep is more like Newcastle.',
    pidgin:
      'Bird die same day wey dem look sick and di comb turn dark or blue, or na die small small over three to five days? Sudden death with dark comb na emergency; slow one na more like Newcastle.',
  },
};

const GENERIC_DISCRIMINATOR: Bilingual = {
  english:
    'Before I name any treatment I need to separate the possibilities: is this one problem or several? Tell me whether the birds are still eating and drinking normally, and whether the droppings changed. Then I can tell you if this is safe to handle at the counter or needs a vet.',
  pidgin:
    'Before I name any treatment, I need separate di possibilities: na one problem be di problem or many? Tell me if di birds still dey eat and drink normal, and if di droppings change. Then I fit tell you if am safe for counter or e need vet.',
};

export const CONFIRM_ACTION: Bilingual = {
  english:
    'To settle it, do a post-mortem on the bird that died most recently and keep the body cool, or send a photo of fresh droppings on white paper. A vet, or the NVRI laboratory in Vom, can confirm from that.',
  pidgin:
    'To confirm am, do post-mortem for di bird wey die most recently and keep am cool, or send photo of fresh droppings for white paper. Vet, or NVRI laboratory for Vom, fit confirm from dat.',
};

const COCCIDIOSIS_SIGNATURE: readonly (readonly string[])[] = [['blood']];

function signatureDiseases(c: CaseData): Disease[] {
  return matchesConcepts(c.symptoms, COCCIDIOSIS_SIGNATURE) ? ['coccidiosis'] : [];
}

function differentialOf(c: CaseData): Disease[] {
  const hits = (c.diseaseHits ?? []).filter((disease) => disease !== 'unknown');
  return [...new Set([...hits, ...signatureDiseases(c)])];
}

function findPartner(differential: readonly Disease[]): Disease | undefined {
  for (const disease of differential) {
    const partner = (CONFUSION_PARTNERS[disease] ?? []).find((candidate) =>
      differential.includes(candidate),
    );
    if (partner !== undefined) return partner;
  }
  return differential[1];
}

export function assessTriage(c: CaseData): Triage {
  const redFlags = redFlagsFor(c);
  const differential = differentialOf(c);
  const notifiable = differential.includes('avian_influenza');

  if (redFlags.length > 0 || notifiable) {
    return {
      band: 'red_flag',
      redFlags,
      differential,
      pairedWith: undefined,
      discriminator: undefined,
      confirmAction: CONFIRM_ACTION,
    };
  }

  const pairedWith = findPartner(differential);
  const uncertain = differential.length >= 2 || (c.needsConfirmation?.length ?? 0) > 0;

  if (pairedWith !== undefined || uncertain) {
    return {
      band: 'ambiguous',
      redFlags,
      differential,
      pairedWith,
      discriminator:
        (differential[0] !== undefined ? DISCRIMINATOR[differential[0]] : undefined) ??
        GENERIC_DISCRIMINATOR,
      confirmAction: CONFIRM_ACTION,
    };
  }

  return {
    band: 'confirmable',
    redFlags,
    differential,
    pairedWith: undefined,
    discriminator: undefined,
    confirmAction: CONFIRM_ACTION,
  };
}

export function triageReply(triage: Triage, lang: 'english' | 'pidgin'): string {
  const question = triage.discriminator ?? GENERIC_DISCRIMINATOR;
  return `I am not 100% sure what is causing this yet, and I will not guess with your flock.\n\n${question[lang]}\n\n${triage.confirmAction[lang]}`;
}

import type { AgroStore, CaseData, Disease } from '@poultry/schemas';
import type { ReplyLanguage } from './language.js';
import { mortalityRate } from './validate.js';
import type { ClinicalLadder, LadderGate, PrescriberRole } from './askfor.js';
import { gateLadder, POLICY_REFUSALS } from './askfor.js';
import { CONFIRM_ACTION, assessTriage } from './triage.js';

export const ESCALATE_SCRIPT =
  'Abeg e no good to delay this one. Dis bird problem serious — you need make we take am serious. ' +
  'We dey redirect you to a veterinary professional wey fit commot out go your farm. ' +
  'Until you see am: separate the sick birds, clean and disinfect the pen, throw away dead birds no touch am with bare hand, ' +
  'and no sell or slaughter any sick bird. You go still get follow-up for the report wey we send.';

export const ESCALATE_SCRIPT_EN =
  'Please do not delay this. The bird problem is serious — we need to take it seriously. ' +
  'We are directing you to a veterinary professional who can come out to your farm. ' +
  'Until you see one: separate the sick birds, clean and disinfect the pen, and do not touch dead birds with bare hands. ' +
  'Do not sell or slaughter any sick bird. You will still get a follow-up on the report we send.';

export function escalationScript(lang: ReplyLanguage): string {
  return lang === 'pidgin' ? ESCALATE_SCRIPT : ESCALATE_SCRIPT_EN;
}

export function buildReferralSlip(
  c: CaseData,
  store?: AgroStore | undefined,
  ladder?: ClinicalLadder,
): string {
  const lines = ['CONTACT THIS AGRO-VET STORE', 'EVERY DAY OF DELAY COST YOU BIRDS.'];
  if (store) {
    lines.push(`Store: ${store.name}`);
    lines.push(`Phone: ${store.phone}`);
    lines.push(`LGA: ${store.lga}, ${store.state}`);
    lines.push(verifiedStockNote(store));
  }
  lines.push('', 'TELL THEM WHAT YOU SEE:');
  lines.push(`- Bird: ${c.species ?? 'unknown'}`);
  if (c.breed) lines.push(`- Breed: ${c.breed}`);
  if (c.birdStage) lines.push(`- Stage: ${c.birdStage}`);
  lines.push(`- Sick birds since: ${c.onsetDays ?? '?'} day(s)`);
  lines.push(`- Symptoms: ${(c.symptoms ?? []).join(', ') || 'unknown'}`);
  if (c.mortalityCount !== undefined) lines.push(`- Deaths so far: ${c.mortalityCount}`);
  const rate = mortalityRate(c);
  if (rate !== undefined) lines.push(`- Mortality rate: ${rate.toFixed(1)}%`);
  if (c.diseaseText) lines.push(`- Suspected: ${c.diseaseText}`);
  lines.push('', ...askForBlock(c, ladder));

  const storeHint = store
    ? `Buy only at ${store.name} and keep your receipt.`
    : 'Buy medicine only inside a known agro-vet store.';
  lines.push('', storeHint);
  return lines.join('\n');
}

const ASK_HEADER = 'ASK THEM FOR:';
const REFUSE_HEADER = 'DO NOT ACCEPT:';
const UNVERIFIED_STOCK = 'We do not know what they stock today, so ask them.';
const NO_DRUG_YET =
  '- The treatment the agro-vet names for the signs above — I will not name a drug without a confirmed diagnosis';

export function verifiedStockNote(store: AgroStore): string {
  if (
    store.stock === undefined ||
    store.stock.length === 0 ||
    store.stockVerifiedAt === undefined
  ) {
    return UNVERIFIED_STOCK;
  }
  return `They confirmed on ${store.stockVerifiedAt.slice(0, 10)} that they stock: ${store.stock.join(', ')}.`;
}

export function askForBlock(c: CaseData, ladder?: ClinicalLadder): string[] {
  const gate = gateLadder(c, ladder);
  const refusals = POLICY_REFUSALS.map((line) => `- ${line}`);

  if (!gate.permitted || ladder === undefined) {
    // Sources and agreement scores stay off the farmer slip: a citation list reads to a
    // farmer as authority the evidence has not earned, and the farmer cannot act on it.
    return [
      ASK_HEADER,
      NO_DRUG_YET,
      ...gate.reasons.map((reason) => `  ${reason}`),
      '',
      REFUSE_HEADER,
      ...refusals,
    ];
  }

  return [
    ASK_HEADER,
    `- ${ladder.productClass}`,
    `  Why: ${ladder.why}`,
    ...ladder.askTheSeller.map((question) => `- Ask: ${question}`),
    '',
    REFUSE_HEADER,
    ...refusals,
    ...(ladder.needsVet ? ['', 'A vet must confirm or administer this one.'] : []),
  ];
}

export interface RankedDifferential {
  disease: Disease;
  agreement: number | undefined;
}

export interface PrescriberBrief {
  role: PrescriberRole;
  caseLine: string;
  differentials: readonly RankedDifferential[];
  ladder: ClinicalLadder | undefined;
  gate: LadderGate;
}

export const PRESCRIBER_DISCLAIMER =
  'Decision support from retrieved sources. Not a prescription and not a diagnosis. ' +
  'Confirm against your own examination before treating, and apply withdrawal periods.';

function caseLine(c: CaseData): string {
  const parts: string[] = [];
  if (c.species !== undefined) parts.push(c.species);
  if (c.birdStage !== undefined) parts.push(c.birdStage);
  if (c.flockAgeWeeks !== undefined) parts.push(`${c.flockAgeWeeks} weeks old`);
  if (c.onsetDays !== undefined) parts.push(`${c.onsetDays}d onset`);
  if (c.mortalityCount !== undefined) parts.push(`${c.mortalityCount} dead`);
  parts.push(`symptoms: ${(c.symptoms ?? []).join(', ') || 'none recorded'}`);
  return parts.join(' | ');
}

export function buildPrescriberBrief(
  c: CaseData,
  role: PrescriberRole,
  ladder?: ClinicalLadder,
): PrescriberBrief {
  const triage = assessTriage(c);
  return {
    role,
    caseLine: caseLine(c),
    differentials: triage.differential.map((disease) => ({
      disease,
      agreement: ladder?.disease === disease ? ladder.evidence.agreement : undefined,
    })),
    ladder,
    gate: gateLadder(c, ladder),
  };
}

export function renderPrescriberBrief(brief: PrescriberBrief): string {
  const lines = [
    'POULTRY CASE BRIEF — DECISION SUPPORT, NOT A PRESCRIPTION',
    `Prepared for: ${brief.role}`,
    `Case: ${brief.caseLine}`,
    '',
    'DIFFERENTIALS:',
  ];
  brief.differentials.forEach((entry, index) => {
    const score =
      entry.agreement === undefined
        ? 'no retrieved evidence'
        : `sources agree ${entry.agreement.toFixed(2)} (not a diagnosis)`;
    lines.push(`${index + 1}. ${entry.disease} — ${score}`);
  });

  lines.push('');
  if (brief.gate.permitted && brief.ladder !== undefined) {
    const ladder = brief.ladder;
    lines.push(
      'CANDIDATE PRODUCT CLASS:',
      `- ${ladder.productClass}`,
      `  Why: ${ladder.why}`,
    );
    for (const question of ladder.askTheSeller) lines.push(`- Ask: ${question}`);
    lines.push('', 'SOURCES:');
    for (const citation of ladder.evidence.citations) {
      lines.push(`- ${citation.source}${citation.locator === undefined ? '' : `, ${citation.locator}`}`);
    }
  } else {
    lines.push('CANDIDATE PRODUCT CLASS: withheld');
    for (const reason of brief.gate.reasons) lines.push(`  - ${reason}`);
  }

  if (brief.ladder?.needsVet === true) {
    lines.push('', 'A vet must confirm or administer this.');
  }
  lines.push('', 'TO CONFIRM:', `  ${CONFIRM_ACTION.english}`, '', PRESCRIBER_DISCLAIMER);
  return lines.join('\n');
}

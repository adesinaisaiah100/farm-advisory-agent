import type { AgroStore, CaseData } from '@poultry/schemas';
import type { ReplyLanguage } from './language.js';
import { mortalityRate } from './validate.js';

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

export function buildReferralSlip(c: CaseData, store?: AgroStore | undefined): string {
  const lines = ['CONTACT THIS AGRO-VET STORE', 'EVERY DAY OF DELAY COST YOU BIRDS.'];
  if (store) {
    lines.push(`Store: ${store.name}`);
    lines.push(`Phone: ${store.phone}`);
    lines.push(`LGA: ${store.lga}, ${store.state}`);
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
  lines.push('', 'ASK THEM FOR:');
  lines.push('- The right medicine or vaccine for the symptoms above');
  lines.push('- Dosage and days to give it — write it down');

  const storeHint = store ? `Buy only at ${store.name} and keep your receipt.` : 'Buy medicine only inside a known agro-vet store.';
  lines.push('', storeHint);
  return lines.join('\n');
}
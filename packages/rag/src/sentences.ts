const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'vs',
  'viz',
  'fig',
  'figs',
  'no',
  'nos',
  'approx',
  'ca',
  'cf',
  'al',
  'etc',
  'et',
  'st',
  'dr',
  'mr',
  'mrs',
  'ms',
  'prof',
  'inc',
  'ltd',
  'vol',
  'p',
  'pp',
]);

const TRAILING = /["')\]]/;

// A boundary needs a terminator, a gap, and something that looks like a new sentence. Skipping
// lowercase followers and digits keeps "e.g. signs", "1.5%" and "Fig. 2" from being cut apart.
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return [];

  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < flat.length; i += 1) {
    const char = flat[i];
    if (char !== '.' && char !== '!' && char !== '?') continue;

    let after = i + 1;
    while (after < flat.length && TRAILING.test(flat[after] as string)) after += 1;
    if (after >= flat.length) break;

    const next = flat[after] as string;
    if (!/\s/.test(next)) continue;
    if (next >= '0' && next <= '9') continue;
    if (next >= 'a' && next <= 'z') continue;
    if (char === '.' && isAbbreviation(flat, i)) continue;

    const sentence = flat.slice(start, after).trim();
    if (sentence.length > 0) sentences.push(sentence);
    start = after;
    i = after - 1;
  }

  const tail = flat.slice(start).trim();
  if (tail.length > 0) sentences.push(tail);
  return sentences;
}

function isAbbreviation(flat: string, dotIndex: number): boolean {
  let cursor = dotIndex - 1;
  while (cursor >= 0 && /[A-Za-z.]/.test(flat[cursor] as string)) cursor -= 1;
  const token = flat.slice(cursor + 1, dotIndex).toLowerCase();
  return ABBREVIATIONS.has(token);
}

export function isGreeting(text: string): boolean {
  const t = text
    .trim()
    .replace(/[!?.,]/g, '')
    .toLowerCase();
  return [
    'hello',
    'hi',
    'good morning',
    'good afternoon',
    'good evening',
    'how far',
    'hey',
  ].includes(t);
}

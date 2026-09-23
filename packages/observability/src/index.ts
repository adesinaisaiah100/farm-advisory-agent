export const SERVICE_NAME = 'poultry-agent';

export function meta(eventId: string) {
  return { service: SERVICE_NAME, eventId };
}
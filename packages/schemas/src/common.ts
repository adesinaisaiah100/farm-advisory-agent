import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export const DateTimeSchema = z.string().datetime();

export type Uuid = z.infer<typeof UuidSchema>;
export type DateTime = z.infer<typeof DateTimeSchema>;
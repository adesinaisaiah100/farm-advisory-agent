import { z } from 'zod';

export const ChunkSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  position: z.number().int().nonnegative(),
  text: z.string(),
});

export type Chunk = z.infer<typeof ChunkSchema>;

export function overlapsChunk(c: Chunk, query: string): boolean {
  return c.text.toLowerCase().includes(query.toLowerCase());
}
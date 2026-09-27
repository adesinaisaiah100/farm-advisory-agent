import type { AnalyzedRegion } from './analyze.js';
import type { ChunkGroup, SourceSpecies, Treatment } from './schema.js';
import { ChunkGroupSchema } from './schema.js';

export interface GroupResult {
  groups: ChunkGroup[];
  warnings: string[];
}

// A group is a run of consecutive regions sharing a page and heading. Breaking here rather than on a
// fixed token count is what keeps a retrieved chunk one clinical claim instead of a slab that
// straddles two sections.
export function buildGroups(
  documentId: string,
  regions: readonly AnalyzedRegion[],
): GroupResult {
  const warnings: string[] = [];
  const ordered = [...regions].sort((a, b) => a.page - b.page);
  const groups: ChunkGroup[] = [];

  let run: AnalyzedRegion[] = [];

  const flush = (): void => {
    if (run.length === 0) return;
    const first = run[0] as AnalyzedRegion;
    const group = ChunkGroupSchema.parse({
      id: `${documentId}#g${groups.length}`,
      documentId,
      heading: first.heading,
      sectionKind: first.sectionKind,
      species: union(run.flatMap((region) => region.species)),
      diseases: union(run.flatMap((region) => region.diseases)),
      treatment: agreeOnTreatment(run, warnings),
      page: Math.min(...run.map((region) => region.page)),
      pageEnd: Math.max(...run.map((region) => region.page)),
      text: run.map((region) => region.text.trim()).join('\n\n'),
    });
    groups.push(group);
    run = [];
  };

  for (const region of ordered) {
    const previous = run[run.length - 1];
    if (previous !== undefined) {
      const samePage = previous.page === region.page;
      const sameHeading = previous.heading === region.heading;
      const sameKind = previous.sectionKind === region.sectionKind;
      if (!samePage || !sameHeading || !sameKind) flush();
    }
    run.push(region);
  }
  flush();

  return { groups, warnings };
}

function agreeOnTreatment(
  run: readonly AnalyzedRegion[],
  warnings: string[],
): Treatment | undefined {
  const treatments = run
    .map((region) => region.treatment)
    .filter((treatment): treatment is Treatment => treatment !== undefined);
  const first = treatments[0];
  if (first === undefined) return undefined;

  for (const treatment of treatments.slice(1)) {
    if (treatment.productClass !== first.productClass) {
      warnings.push(
        `merged regions disagree on product class (${first.productClass} vs ${treatment.productClass}); kept ${first.productClass}`,
      );
    }
  }
  return first;
}

function union<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export type { SourceSpecies };

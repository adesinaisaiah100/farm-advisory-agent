import { RegionMapSchema } from './schema.js';
import type { Page, Region, RegionMap, SourceDocument } from './schema.js';
import { locatePage } from './paginate.js';

export interface AnalyzeRequest {
  document: SourceDocument;
  pages: readonly Page[];
  text: string;
}

// Returns unknown on purpose: whatever the map call produced is untrusted input until parsed.
export interface Analyzer {
  analyze(request: AnalyzeRequest): Promise<unknown>;
}

export interface AnalyzedRegion extends Region {
  page: number;
}

export interface AnalyzeResult {
  regions: AnalyzedRegion[];
  warnings: string[];
}

export class RegionMapError extends Error {
  constructor(readonly detail: string) {
    super(`analyze_document returned an unusable region map: ${detail}`);
    this.name = 'RegionMapError';
  }
}

export async function analyzeDocument(
  request: AnalyzeRequest,
  analyzer: Analyzer,
): Promise<AnalyzeResult> {
  const raw = await analyzer.analyze(request);
  const parsed = RegionMapSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RegionMapError(parsed.error.issues.map((issue) => issue.path.join('.')).join(', '));
  }
  return placeRegions(parsed.data, request.pages);
}

function placeRegions(map: RegionMap, pages: readonly Page[]): AnalyzeResult {
  const warnings: string[] = [];
  const placed: AnalyzedRegion[] = map.regions.map((region, index) => {
    const located = locatePage(region.text, pages);
    if (located === undefined) {
      const page = region.pageHint ?? pages[0]?.number ?? 1;
      warnings.push(
        `region ${index} (${region.heading}) could not be located in the paged text; cited to page ${page}`,
      );
      return { ...region, page };
    }
    if (region.pageHint !== undefined && region.pageHint !== located) {
      warnings.push(
        `region ${index} (${region.heading}) claimed page ${region.pageHint} but appears on page ${located}; using ${located}`,
      );
    }
    return { ...region, page: located };
  });

  return { regions: placed, warnings };
}

export function normalizeDiseases(regions: readonly AnalyzedRegion[]): AnalyzedRegion[] {
  return regions.map((region) => ({
    ...region,
    diseases: [...new Set(region.diseases.filter((disease) => disease !== 'unknown'))],
  }));
}

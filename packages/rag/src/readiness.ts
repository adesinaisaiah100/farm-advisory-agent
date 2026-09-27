import type { Embedder } from './embed/embedder.js';
import type { ChunkRepository, VectorStore } from './search/store.js';

export interface ComponentHealth {
  readonly ok: boolean;
  readonly detail?: string;
}

export interface ReadinessReport {
  readonly postgres: ComponentHealth;
  readonly embed: ComponentHealth;
  readonly stages: StageHealth;
  readonly ready: boolean;
}

export interface ReadinessDeps {
  readonly store: VectorStore;
  readonly embedder: Embedder;
}

const PROBE_TEXT = 'poultry readiness probe';

/**
 * `/ready` for the two dependencies Phase 5 adds: Postgres (counting rows, so a
 * dropped connection fails rather than an idle pool answering) and the embedder.
 *
 * The embed probe costs one real embedding call. A cheaper ping would not catch a
 * revoked key, an exhausted free-tier quota, or a model that stopped serving,
 * which are the failures that actually happen.
 */
export async function checkReadiness(deps: ReadinessDeps): Promise<ReadinessReport> {
  const postgres = await probePostgres(deps.store);
  const embed = await probeEmbedder(deps.embedder);
  const stages = await probeStages(deps.store);
  return { postgres, embed, stages, ready: postgres.ok && embed.ok && stages.ok };
}

export interface StageHealth extends ComponentHealth {
  readonly documents: number;
  readonly chunks: number;
}

/**
 * A database that answers every query is not a ready database. A green Postgres
 * probe over an empty corpus would report ready and then refuse every farmer for
 * lack of evidence, so an unmigrated or unseeded store is reported unready.
 */
async function probeStages(store: VectorStore): Promise<StageHealth> {
  if (!hasCountDocuments(store)) {
    return { ok: false, detail: 'store cannot report document count', documents: -1, chunks: -1 };
  }
  try {
    const chunks = await store.countChunks();
    const documents = await store.countDocuments();
    if (documents === 0 || chunks === 0) {
      return {
        ok: false,
        detail: `corpus is empty: ${documents} documents, ${chunks} chunks`,
        documents,
        chunks,
      };
    }
    return { ok: true, detail: `${documents} documents, ${chunks} chunks`, documents, chunks };
  } catch (error) {
    return { ok: false, detail: messageOf(error), documents: -1, chunks: -1 };
  }
}

function hasCountDocuments(store: VectorStore): store is VectorStore & Pick<ChunkRepository, 'countDocuments'> {
  return typeof (store as Partial<ChunkRepository>).countDocuments === 'function';
}

async function probePostgres(store: VectorStore): Promise<ComponentHealth> {
  try {
    const count = await store.countChunks();
    return { ok: true, detail: `${count} chunks` };
  } catch (error) {
    return { ok: false, detail: messageOf(error) };
  }
}

async function probeEmbedder(embedder: Embedder): Promise<ComponentHealth> {
  try {
    const [vector] = await embedder.embed([PROBE_TEXT]);
    if (vector === undefined) {
      return { ok: false, detail: 'embedder returned no vector' };
    }
    const width = vector?.length ?? 0;
    if (width !== embedder.dims) {
      return { ok: false, detail: `embedder returned ${width} dims, expected ${embedder.dims}` };
    }
    return { ok: true, detail: `${embedder.dims} dims` };
  } catch (error) {
    return { ok: false, detail: messageOf(error) };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

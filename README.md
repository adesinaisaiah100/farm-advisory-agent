# Poultry Agent (BirdVet / Poultry Sam)

Conversational AI poultry advisory agent for Nigerian semi-commercial farmers (200–2,000 birds), on WhatsApp.
Four doors: **RESOLVE** · **SUPPLY** · **ESCALATE** · **REPORT**.

## Read these first
- `SYSTEM_DESIGN.md` — full system design (problem, research journey, architecture)
- `STACK.md` — locked stack + deploy map + free-tier budget (~$0 demo)
- `PHASES.md` — phase plan, what ships when, what test proves each phase
- `AGENTS.md` — binding code rules, workflow, test guidelines

## Repo layout
```
apps/api          Hono API → Cloudflare Workers
apps/web          React + Vite dashboard + web chat → Cloudflare Pages
packages/schemas  Zod contracts (no I/O)
packages/core     orchestrator state machine + four doors (pure)
packages/rag      KB ingestion + pgvector retrieval
packages/stores   agro-vet store lookup (referral slips)
packages/media    R2 + transcription + vision (confidence-gated)
packages/bridge   Baileys WhatsApp adapter (Node host)
packages/observability  log/otel helpers
tests/            shared fixtures (Pidgin samples, goldens)
```

## Commands (run from repo root)
```sh
pnpm install          # first time
pnpm check            # typecheck + lint + unit tests (the green gate)
pnpm test:unit        # unit tests only
pnpm test:integ       # gated integration tests (needs RUN_INTEG=1 + env)
pnpm --filter @poultry/api dev   # run one package's dev
```

## Status
Phase 0 (foundation) shipped. Everything after it is tracked in `PHASES.md`.
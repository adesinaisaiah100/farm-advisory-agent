# Phase 0 — Monorepo Foundation

**Status:** ✅ shipped · commit `a82f34e`

## What this phase did

Bootstrapped the whole repo so every later phase can be built, tested, and merged
independently. The rule that makes the whole plan work: **every package is testable
alone, against fakes, with no network, no DB, no sockets.**

## File structure

```
farm-advisory-agent/
├─ package.json              root manifest (poultry-agent, script: check)
├─ pnpm-workspace.yaml       packages/*, apps/*, tests; build scripts allowed
├─ tsconfig.base.json        strict TS shared by all packages (noEmit, paths)
├─ vitest.config.ts          vitest root config (tsconfig paths)
├─ eslint.config.js          flat ESLint config (typescript-eslint + prettier)
├─ .prettierrc.json .prettierignore
├─ .gitignore                node_modules, dist, .env, .dev.vars
├─ .github/workflows/check.yml   (REMOVED in Phase 1 — testing is local now)
├─ AGENTS.md                 binding repo rules + test contract
├─ PHASES.md                 the phase plan + progress tracker
├─ README.md
├─ packages/
│  ├─ schemas/               Phase 1 (see next file)
│  ├─ core/                  Phase 2 (planned)
│  ├─ rag/ stores/ media/ bridge/ observability/   (later phases)
│  ├─ schemas/… each: package.json, tsconfig.json, src/index.ts + test canary
├─ apps/
│  ├─ api/      Hono skeleton: GET /health green
│  └─ web/      React+Vite shell: heading test green
└─ tests/fixtures/pidgin/, tests/goldens/   (fixture homes for later phases)
```

## What was built

- pnpm workspace, TypeScript strict (`noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`), Vitest wired, ESLint + Prettier wired.
- One canary module + one canary test in **every** package (schemas, core, rag,
  stores, bridge, media, observability) and both apps.
- `apps/api`: Hono `createApp()` with `GET /health` returning 200 + `@hono/node-server`
  for local dev.
- `apps/web`: React + Vite dashboard shell with a jsdom-rendered heading test.
- `AGENTS.md` written: locked stack, one-way dependency direction, no `any`, Pidgin
  preserved verbatim, E.164 phone rule, formatting enforced, write-tests contract
  (unit = no network; integration gated by `RUN_INTEG=1`; golden tests for any text
  formatter; error paths are tests).
- `PHASES.md` written: the 11-phase plan with a dependency graph and the ordering
  rationale (cheapest slice first, longest-pole risk earliest).

## Gate

`pnpm check` (typecheck + lint + unit) exits 0 across all 10 workspace projects.

## Environment notes

- **pnpm on this machine:** the npm-global `pnpm.exe` stub was broken. `pnpm.cmd` /
  `pnpm.ps1` / `pnpm` shims now point at `…\node_modules\pnpm\pnpm-native.exe`
  (working, v12.6.0).
- **pnpm 11/12 quirk:** `onlyBuiltDependencies` was renamed to `allowBuilds` (map
  form) — required for esbuild's postinstall.
- Packages are consumed as **source** (`main`/`types` → `./src/index.ts`, tsconfigs
  `noEmit`) — avoids TS6059 rootDir errors and removes the need for `dist` builds.

## Differences from the earlier plan

None. This phase matches the plan; the only change came later (CI removed in Phase 1).
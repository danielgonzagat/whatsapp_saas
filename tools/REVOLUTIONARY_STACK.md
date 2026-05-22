# KLOEL Revolutionary Operational Stack

Built 2026-05-20 as the second wave of the graphify-plus initiative. Adds the 9 layers identified as blockers to completing the codebase to production at the speed required.

## The full stack

| Layer | Tool | What it does | npm |
|---|---|---|---|
| L1–L6 | `tools/graphify-plus/extractors/{bullmq,nestjs,nextjs,api-contract,metadata,runtime-railway}.mjs` | Framework-aware AST extractors + cross-repo contract + metadata layer + Railway runtime overlay | `npm run graph:extract[:full]` |
| **L7 — Live diagnostics** | `tools/graphify-plus/extractors/diagnostics.mjs` | Runs `tsc --noEmit` + `eslint --format json` across backend/frontend/worker, annotates each file with errors/warnings as graph nodes. Cached by mtime. | `npm run graph:diagnostics` |
| **L8 — Test impact + coverage** | `tools/graphify-plus/extractors/test-impact.mjs` | Maps every spec to symbols it exercises (via imports). Merges existing vitest/jest coverage JSON. Becomes `spec` and `coverage` nodes with `exercises` and `covers` edges. | `npm run graph:extract` |
| **L9 — Bundle / perf** | `tools/graphify-plus/extractors/bundle.mjs` | Reads `frontend/.next/app-build-manifest.json` + Lighthouse CI runs and annotates each Next page with bundle size and Core Web Vitals. | `npm run graph:extract` (after `next build`) |
| **L10 — E2E sandbox harness** | `tools/e2e-sandbox/` | Docker compose: postgres + redis + stripe-mock + meta-waha-mock. Boots in ~10s. Writes `.env.sandbox`. | `npm run sandbox:up / sandbox:seed / sandbox:down` |
| **L11 — Multi-agent TaskGraph** | `tools/agent-coordination/taskgraph.mjs` | File-based locks per graph cluster. Prevents two agents from touching the same area concurrently. 30 min TTL with heartbeat. Atomic JSON write. | `npm run agent:claim / agent:release / agent:list / agent:sweep` |
| **L12 — Memory curator** | `tools/memory-curator/curate.mjs` | Scans `~/.claude/projects/.../memory/` for dupes, stale entries (>90d without citation), orphans (not in MEMORY.md), broken `[[links]]`, oversized files. Archives via `--apply`. Never deletes. | `npm run memory:scan / memory:prune / memory:dedupe` |
| **L13 — Auto-PR pipeline** | `tools/auto-pr/runner.mjs` | Reads a JSON job (`{branch, files[], shell[], title, body, labels}`), creates worktree off main, applies patches, runs pre-commit validations, pushes, opens PR via `gh`. Idempotent. | `npm run auto-pr -- <job.json>` |
| **L14 — Session state recovery** | `tools/session-state/recover.mjs` | Writes `SESSION_STATE.md`: branch, divergence vs main, my open PRs + CI status, active workflow runs, task-graph locks, scheduled wakeups, local long-running processes. Run at session start. | `npm run session:state` |
| **L15 — Real-data sampling** | `tools/db-sample/sample.mjs` | Pulls N rows per table from Postgres (DATABASE_PUBLIC_URL), scrubs PII columns (email/phone/cpf/cnpj/name/token/secret/key/password/address) via SHA-1 hash, writes JSONL to `graphify-out/db-sample/`. Read-only by design. | `npm run db:sample -- --rows=50` |

## How it composes

The full operating loop for completing this codebase to production:

```
┌─ 1. Session start ─────────────────────────────────────────┐
│  npm run session:state                                     │
│  → SESSION_STATE.md gives full picture in 3s              │
│                                                            │
│  npm run agent:sweep                                       │
│  → release any expired locks left by prior sessions       │
└────────────────────────────────────────────────────────────┘
                              ↓
┌─ 2. Plan a unit of work ───────────────────────────────────┐
│  npm run graph:extract --fast                              │
│  → enriched-graph.json (89k nodes)                        │
│                                                            │
│  npm run graph:edit -- query <Symbol>                      │
│  → blast radius, callers, atomic-edit hand-off plan       │
└────────────────────────────────────────────────────────────┘
                              ↓
┌─ 3. Claim cluster (prevent concurrent agent collision) ───┐
│  npm run agent:claim whatsapp_saas/marketing/X claude-1   │
│  → file lock with 30-min TTL                              │
└────────────────────────────────────────────────────────────┘
                              ↓
┌─ 4. Validate inner loop ──────────────────────────────────┐
│  npm run graph:diagnostics                                 │
│  → typecheck + lint per file, materialised as nodes       │
│                                                            │
│  query enriched-graph.json index.byType.spec for          │
│  exercises edges pointing to your file → run only those  │
│  specs instead of full vitest                             │
└────────────────────────────────────────────────────────────┘
                              ↓
┌─ 5. Full integration (when needed) ───────────────────────┐
│  npm run sandbox:up                                        │
│  npm run sandbox:seed                                      │
│  → embedded Postgres + Redis + Stripe-mock + Meta/WAHA   │
│  → run E2E without touching Railway                       │
└────────────────────────────────────────────────────────────┘
                              ↓
┌─ 6. Ship in bulk ─────────────────────────────────────────┐
│  emit N job JSONs (one per cluster needing same fix)      │
│  npm run auto-pr -- --queue=jobs/*.json                   │
│  → opens N PRs in parallel, each scoped, each validated  │
└────────────────────────────────────────────────────────────┘
                              ↓
┌─ 7. Maintain ────────────────────────────────────────────┐
│  npm run memory:scan                                       │
│  → see drift, archive stale, dedupe                       │
│                                                            │
│  npm run agent:release whatsapp_saas/marketing/X claude-1 │
└────────────────────────────────────────────────────────────┘
```

## Composability with the rest

- All shards land in `graphify-out/shards/*.json` (gitignored) — same neutral shape, merged by `tools/graphify-plus/run.mjs` into `enriched-graph.json`.
- `lib/edit-by-graph.mjs` consumes the enriched graph and hands off to the [atomic-edit MCP](../scripts/mcp/atomic-edit/) for the actual edits.
- `tools/agent-coordination/taskgraph.mjs` uses the cluster IDs from `enriched-graph.json`'s `community` field, so locks are scoped to topology-relevant areas, not arbitrary names.
- `tools/auto-pr/runner.mjs` consumes the same diff format as `tools/graphify-plus/lib/diff.mjs` outputs.
- `tools/db-sample/sample.mjs` writes to a path consumable by `tools/e2e-sandbox/seed.mjs` (future integration).

## Constraints honored

- **Determinism**: pure AST + regex everywhere except runtime overlay (Railway logs) and diagnostics (which run actual `tsc`/`eslint`). Same input → same output.
- **No protected file modifications**: nothing touches `CLAUDE.md`, `AGENTS.md`, `ops/*.json`, `scripts/ops/check-*.mjs`, `.husky/pre-push`, `.github/workflows/ci-cd.yml`, or the ESLint configs.
- **No production-side writes**: the Railway runtime overlay and db-sample tool are **read-only** on the live systems. The only write paths are `npm run sandbox:*` (local containers) and `tools/auto-pr/runner.mjs` (creates branches + PRs, never force-pushes, never touches main).
- **No git restore**: per repo policy, none of these tools use `git restore`. Auto-pr uses `worktree add -b` off `origin/main`.
- **PII safety**: `db-sample` scrubs every column matching `email|phone|cpf|cnpj|name|token|secret|key|password|address`. SHA-1 hash with `pii_` prefix; length preserved for shape realism.

## Roadmap (remaining)

Already pinned in `tools/graphify-plus/README.md`:

- [ ] LSP push-updates (currently pull via `npm run graph:diagnostics`) — needs tsserver hook
- [ ] WebGL hierarchical viz (3 layers) — Cytoscape.js + WebGL renderer
- [ ] Type-flow tracking — propagation of Prisma client type changes to consumers
- [ ] Doc-freshness overlay — timestamp every node's nearest docstring vs last symbol edit

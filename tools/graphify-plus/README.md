# graphify-plus

Deterministic enrichment layer on top of [graphifyy](https://pypi.org/project/graphifyy/).

graphifyy is excellent at AST + semantic LLM extraction but it misses framework-specific dynamic relations (NestJS DI, BullMQ producers↔consumers, Next.js file-based routing), cross-repo API contracts (frontend `apiFetch` ↔ backend `@Get`), the link between code and *decisions* (ADRs, memory, CLAUDE.md), and live runtime signals from Railway.

`graphify-plus` adds 6 extractors + 1 orchestrator that read the upstream `graphify-out/graph.json` and produce `graphify-out/enriched-graph.json`, plus standalone tools for graph diffs and edit-by-graph orchestration with the [atomic-edit MCP](../mcp/atomic-edit/).

All extractors are **pure AST + regex**. Zero LLM calls. Reproducible, deterministic, cheap.

## Quick start

```bash
# Extract everything (fast path — no network calls)
node tools/graphify-plus/run.mjs --fast

# Include live Railway runtime overlay (needs RAILWAY_TOKEN + project IDs)
node tools/graphify-plus/run.mjs

# Single extractor
node tools/graphify-plus/run.mjs --extractors=bullmq

# Topological diff between two graphs
node tools/graphify-plus/lib/diff.mjs graphA.json graphB.json

# Inspect a symbol with full fan-out + atomic-edit hand-off plan
node tools/graphify-plus/lib/edit-by-graph.mjs query AutopilotOpsService
node tools/graphify-plus/lib/edit-by-graph.mjs deps WhatsAppService
```

## What each extractor adds

| Extractor | Why graphifyy doesn't see it | Output |
|---|---|---|
| `bullmq` | Queue names are string literals; AST loses the producer↔consumer link | nodes: `queue`, `queue-producer`, `queue-consumer`; edges: `enqueues`, `consumed-by` |
| `nestjs` | DI happens via `@Module/@Injectable/@Inject` decorators + constructor type resolution at runtime | nodes: `nest-module`, `nest-controller`, `nest-provider`, `nest-token`; edges: `imports-module`, `provides`, `mounts`, `exports-provider`, `injects` |
| `nextjs` | App-router routing is *file-based* — no symbol carries the route | nodes: `next-page`, `next-route`, `next-route-method`, `next-layout`; edges: `wraps`, `exposes-method` |
| `api-contract` | The cross-repo link is via *string-equality of routes* | nodes: `api-endpoint`, `api-callsite`; edges: `exposes-route`, `calls-endpoint` |
| `metadata` | Code↔policy↔memory crosses files and lives outside AST | nodes: `policy`, `adr`, `doc`, `memory`; edges: `mentions`, `mentions-file` |
| `runtime-railway` | Telemetry only exists in live logs | nodes: `runtime-overlay`, `runtime-queue-overlay`; edges: `observes` |

## Shard format

Every extractor emits the same neutral shape so the merger is trivial:

```jsonc
{
  "nodes": [{ "id": "...", "label": "...", "type": "...", "file": "...", "line": 12, "meta": {} }],
  "edges": [{ "source": "...", "target": "...", "kind": "...", "meta": {} }],
  "stats": { "...": 0 }
}
```

IDs follow `type:slug` convention (`queue:autopilot-jobs`, `nest-provider:WhatsAppService`). The orchestrator de-duplicates by `id`.

## Enriched graph

The orchestrator writes `graphify-out/enriched-graph.json`:

```jsonc
{
  "nodes":  [...],   // base graphify nodes + every extractor's nodes
  "edges":  [...],   // base graphify links + every extractor's edges
  "shards": { "bullmq": { ... stats ... }, ... },
  "index":  { "byFile": { ... }, "byType": { ... } },
  "meta":   { "generatedAt": "...", "totalNodes": N, "totalEdges": M, ... }
}
```

`index.byFile` and `index.byType` are inverted lookups — useful for queries like "what symbols live in this file" without scanning all nodes.

## Runtime overlay (Railway)

Requires (per Railway service):

- `RAILWAY_TOKEN` or `RAILWAY_API_TOKEN` (account-level Bearer)
- `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`
- `RAILWAY_BACKEND_SERVICE_ID`, `RAILWAY_WORKER_SERVICE_ID`

The KLOEL workspace already has these in `.env.pulse.local` (gitignored, never log).

```bash
set -a; source .env.pulse.local; set +a
RAILWAY_BACKEND_SERVICE_ID='...' RAILWAY_WORKER_SERVICE_ID='...' \
node tools/graphify-plus/run.mjs --extractors=runtime-railway
```

Each observed HTTP route becomes a `runtime-overlay` node with: `calls`, `errors`, `error_rate`, `p50`, `p95`, `sample_size`. Queues with warns become `runtime-queue-overlay` nodes. Edges `observes` connect overlays to the structural endpoint/queue nodes.

Queries that newly become possible:

```bash
# Hotspots: anything with errors recently
jq '.nodes[] | select(.type=="runtime-overlay" and .meta.error_rate > 0)' graphify-out/enriched-graph.json

# Dead code: backend handlers never observed in the last hour
jq '...' (left as exercise — the link to make is api-endpoint without inbound observes)
```

## Layered with atomic-edit + memory

The full Claude operational stack:

1. **graphify-plus** (this) — *what & where, including dynamic relations and live state*
2. **atomic-edit MCP** — *how to edit it safely, transactionally, cross-file*
3. **Memory** (`~/.claude/projects/.../memory/`) — *why it exists; past decisions*

`lib/edit-by-graph.mjs query <symbol>` produces a JSON plan that names the atomic-edit call directly:

```jsonc
{
  "target": { "id": "...", "file": "...", "line": N },
  "callers": [...],
  "called":  [...],
  "blast_radius": K,
  "next_steps": {
    "atomic_rename_call": {
      "tool": "mcp__atomic-edit__atomic_rename_symbol_cross_file",
      "params": { "file": "...", "symbol": "..." },
      "note": "K callers — review fan-out"
    }
  }
}
```

## Determinism guarantees

- No LLM, no network (except `runtime-railway`).
- Regex / file walk only — same input → same output, modulo filesystem race during a refactor.
- Safe under concurrency with the upstream `graphify watch` (different output directory `graphify-out/shards/` + `enriched-graph.json`; the watcher writes to `graphify-out/graph.json`).
- File size capped at 2 MB per file (skip generated bundles).
- Default ignore list covers `node_modules`, `dist`, `.next`, `build`, `.git`, `coverage`, `.husky`, `.cache`, `graphify-out`, `.claude`, `.codacy`, `test-results`, `playwright-report`.

## Cost & runtime (this repo, 844k LOC)

| Extractor | Runtime | Output |
|---|---|---|
| bullmq | ~1s | 96 nodes / 80 edges |
| nestjs | ~2s | 892 nodes / 2128 edges |
| nextjs | ~1s | 280 nodes / 272 edges |
| api-contract | ~3s | 1219 nodes / 3584 edges |
| metadata | ~1s | 907 nodes / 14733 edges |
| runtime-railway | ~5s (network) | 17 nodes / 85 edges |
| **merge** | ~3s | enriched-graph.json — 89.2k nodes / 187.2k edges |
| **total fast** | **~10s** | |
| **total with runtime** | **~15s** | |

## Roadmap

Implementação parcial vs revolutionary roadmap (proposed 2026-05-20):

- [x] Framework-aware extractors (NestJS / BullMQ / Next.js)
- [x] API-contract cross-repo
- [x] Metadata layer (ADR + memory + CLAUDE.md)
- [x] Runtime overlay (Railway logs/health) — first cut, more adapters welcome (Sentry, Datadog, Prometheus)
- [x] PR-aware diffing (`lib/diff.mjs`)
- [x] Edit-by-graph orchestrator (hand-off plan to atomic-edit)
- [ ] LSP-pushed sub-second updates (vs file-watcher batches)
- [ ] WebGL graph viz hierárquica (3 layers)
- [ ] Test-coverage overlay
- [ ] Doc-freshness overlay
- [ ] Type-flow tracking

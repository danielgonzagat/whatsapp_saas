# Cognitive Participation Metric

> Quantifies the share of the KLOEL source codebase that actually
> participates in the cognition loop (Mind / event spine) versus the share
> that is structurally dead relative to it.
>
> Source: `scripts/cognitive-participation.mjs`
> Contract spec: `scripts/cognitive-participation.spec.mjs`
> Mode: read-only, pure Node.js, deterministic.

---

## Why this exists

The product thesis is that KLOEL is a *Mind*. If the Mind is the substrate of
the product, the share of code that emits, observes, or consumes
Mind/cognition signals is the most honest top-line health metric the
codebase exposes. CodeGraph already tells us there are **6,121 indexed
files** total; this scanner answers the next question: *of the source files
the runtime actually executes, how many are wired into the cognition loop?*

A high participation percentage means the cognition substrate is real and
load-bearing. A low percentage means most of the codebase is shell — UX, CRUD,
glue — that lives next to the Mind but does not feed or read from it. Both
shapes are legitimate; what matters is being honest about which we have.

---

## Scope

The scanner walks three workspaces:

| Workspace | Root              | Extensions |
| --------- | ----------------- | ---------- |
| backend   | `backend/src/`    | `.ts`      |
| worker    | `worker/`         | `.ts`      |
| frontend  | `frontend/src/`   | `.ts`, `.tsx` |

Excluded across the board:

- `*.spec.ts`, `*.spec.tsx`, `*.test.ts`, `*.test.tsx`, `*.d.ts`
- any path segment in `node_modules/`, `dist/`, `build/`, `.next/`,
  `.git/`, `coverage/`, `.turbo/`, `.cache/`, `tmp/`
- dotfiles & dot-directories (covers `.claude/`, `.husky/`, etc.)

---

## Classification

Each source file is tagged with zero-or-more of the following labels. A file
with no positive tag is tagged `DEAD`.

| Tag             | Definition |
| --------------- | ---------- |
| `EMITTER`       | Emits any `cognition.*` or `commerce.*` event — directly via an EventEmitter-like API (`emit('cognition.x', …)`), through the canonical wrapper family (`emitCognitionAlias`, `publishCommerceEvent`, …), or by referencing an event-name string literal of the canonical shape. |
| `MIND_CONSUMER` | Non-PILLAR file that imports any module under `backend/src/{kloel,admin}/mind/**`, OR any symbol matching `Mind[A-Z]\w+`. |
| `PILLAR`        | Lives under `backend/src/kloel/mind/**` or `backend/src/admin/mind/**` — the 8 pillars plus their supporting services. |
| `OBSERVED`      | Subset of `EMITTER` restricted to files that emit at least one `cognition.*` (not `commerce.*`) event. Files in this set are visible to the Mind's observation channel. |
| `DEAD`          | None of the above. The file does not participate in the cognition loop. |

Participation rule: a file is considered *participating* if it carries at
least one non-`DEAD` tag. The headline metric is
`participating / total * 100`.

---

## Current snapshot

Measured 2026-05-29 against the working tree at branch
`codex/backlog-consolidation-production-v2`. (The scan can drift by a handful
of files between back-to-back runs while concurrent agents commit on the
branch; the spec's invariants hold across any consistent tree.)

```text
Total scanned files: 3519
Participating:        334  (9.49%)
Dead:                3185
```

Tag breakdown (files may carry multiple tags):

| Tag             | Files | % of total |
| --------------- | ----: | ---------: |
| EMITTER         |   109 |      3.10% |
| MIND\_CONSUMER  |   140 |      3.98% |
| PILLAR          |   139 |      3.95% |
| OBSERVED        |    13 |      0.37% |
| DEAD            |  3185 |     90.51% |

Per workspace:

| Workspace | Total | Participating | %       | EMITTER | MIND\_CONSUMER | PILLAR | OBSERVED | DEAD |
| --------- | ----: | ------------: | ------: | ------: | -------------: | -----: | -------: | ---: |
| backend   |  2036 |           334 | 16.40%  |     109 |            140 |    139 |       13 | 1702 |
| worker    |   198 |             0 |  0.00%  |       0 |              0 |      0 |        0 |  198 |
| frontend  |  1285 |             0 |  0.00%  |       0 |              0 |      0 |        0 | 1285 |

### What the numbers say

- **The cognition substrate is backend-only.** Today there is zero
  measurable participation from the worker and frontend workspaces in the
  canonical cognition event spine or in Mind service imports. The worker
  emits its own `autopilot.*`/`agent.*` lifecycle events (visible in the
  AsyncAPI inventory) but does not yet route through `cognition.*` or
  `commerce.*`. The frontend consumes via REST/SWR and does not import Mind
  services directly. Both are legitimate today; both are candidates for the
  next-wave participation lift.
- **PILLAR ≈ 4% of the codebase.** 139 source files form the Mind
  pillars + supporting services. This is the lower bound on Mind surface
  area — every other participating file is either an EMITTER (feeds the
  Mind) or a MIND\_CONSUMER (reads from it).
- **OBSERVED is tiny (13 files).** Only 13 backend files emit an event
  prefixed `cognition.` (vs. `commerce.`). The canonicalization plan calls
  out broadening this to cover the full commerce-as-cognition mapping; the
  current number is the honest baseline.
- **Backend participation is 16.4%.** Inside the backend workspace itself,
  roughly 1 in 6 source files participates in the cognition loop. The other
  ~1.7k backend files are CRUD/transport/glue that surround the Mind.

### Baseline against CodeGraph

CodeGraph reports 6,121 indexed files total. The scanner reports 3,519
non-test source files. The ~2,600-file gap is accounted for by:

- 482 `*.spec.ts` / `*.test.ts` files (excluded by design).
- 369 indexed JavaScript files (e.g. `tools/`, `scripts/`, generated config)
  outside the three runtime workspaces.
- ~1.7k indexed assets such as `.next/` build artefacts, `coverage/`
  reports, `node_modules/` re-exports, and other paths excluded by this
  scanner's runtime-source filter.

This split is intentional: the metric only counts files that ship to
production at runtime.

---

## Reproducibility

The scanner is pure Node.js (no extra dependencies) and reads only the
working tree. Numbers are deterministic across runs as long as the source
tree is identical.

```bash
# Human-readable summary (to stderr)
node scripts/cognitive-participation.mjs

# Machine-readable summary (to stdout)
node scripts/cognitive-participation.mjs --json

# Full file-level enumeration alongside the summary
node scripts/cognitive-participation.mjs --files

# Self-executing contract spec — verifies the scanner shape & invariants
node scripts/cognitive-participation.spec.mjs
```

Cross-checks the metric was triangulated against:

```bash
# CodeGraph file count baseline
#   → MCP: mcp__codegraph__codegraph_status
# Returns "Files indexed: 6121" (entire repo, includes tests + assets)

# Canonical event inventory
#   → MCP: mcp__cognitive-hub__protocol_hub_asyncapi
# Returns 122 events total, including 5 cognition.* and >50 commerce.*

# Mind class inventory (PILLAR floor)
#   → MCP: mcp__codegraph__codegraph_search query="Mind" kind="class"
# Lists MindModule, MindController, MindBackgroundProcessor, …
```

---

## Invariants the spec enforces

The contract spec (`scripts/cognitive-participation.spec.mjs`) refuses to
pass unless the scanner upholds:

1. `summary.total === files.length`.
2. `participating + dead === total` (a file is exclusively in one camp).
3. `deadCount === tagCounts.DEAD`.
4. `participatingPct` rounds to the same 2-decimal value as
   `participating / total * 100`.
5. The sum of per-workspace `total` equals the global `total`.
6. Per workspace, `participating + DEAD === total` and no tag count
   exceeds `total`.
7. Every file carries ≥ 1 tag. `DEAD` is exclusive (cannot co-occur with
   any other tag).
8. `OBSERVED ⊂ EMITTER` (the OBSERVED set is always a subset of EMITTER).
9. Every `PILLAR` file lives under the canonical `backend/src/{kloel,admin}/mind/`
   prefix.
10. The known-canonical emitter sites
    (`backend/src/kloel/mind/consciousness/mind-consciousness.service.ts`,
    `backend/src/kloel/kloel-thinker.abi.helpers.ts`) are still detected as
    `EMITTER` (when present on disk — tolerates renames during
    canonicalization).

A scanner regression that breaks any of those will fail the spec — that is
the only safety net this metric has, and it is intentionally cheap to run.

---

## Known limitations

- **Static AST-free regexes.** The classifier reads each file as text and
  matches well-known patterns. It will under-count files that emit events
  via *highly* dynamic indirection (e.g. event names assembled at runtime
  from non-literal pieces). The companion `mcp__cognitive-hub__protocol_hub_asyncapi`
  inventory is the authoritative event list; this scanner is a *file-level*
  participation projection, not a runtime trace.
- **Worker emits do not match the canonical regex.** The worker's
  cognition/autopilot processors emit via the BullMQ Job lifecycle, not
  through `EventEmitter`, and use `autopilot.*`/`agent.*` shorthand event
  names. They will start matching as `EMITTER` once they migrate to the
  canonical `cognition.*` / `commerce.*` taxonomy.
- **Frontend participation is structurally 0% today.** The UI consumes via
  REST/SWR; there is no client-side Mind import. Lifting this would mean
  shipping a Mind-aware client SDK or exposing canonical event names in
  shared contract packages.

These limits are visible in the breakdown above — the metric is honest
about what it can and cannot see.

---

## Next-action candidates (informational; not a plan)

If the goal becomes lifting the participation percentage, the cheapest moves
are visible right now:

1. **Worker → canonical taxonomy.** Migrate `worker/processors/autopilot/`
   to emit `cognition.*` / `commerce.*` instead of shorthand strings. This
   alone would lift 50+ worker files into EMITTER/OBSERVED.
2. **Broaden OBSERVED.** Audit every COMMERCE-only EMITTER to see which
   commerce events should also be observed as cognition (per
   `EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md`).
3. **Frontend shared contracts.** A typed client for `cognition.*` /
   `commerce.*` event names imported into the frontend would tag those
   modules as MIND\_CONSUMER without any UI change.

None of the above is in scope here — this document only certifies the
baseline.

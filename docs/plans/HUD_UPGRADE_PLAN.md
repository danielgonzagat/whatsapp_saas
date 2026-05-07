# KLOEL Obsidian HUD Upgrade Plan

> **Branch**: `chore/ai-constitution-obsidian-graph-lock`
> **Status**: Active — plan execution starting 2026-05-02
> **Ratified by**: Daniel, 2026-05-02 (decisões 1, 2, 3)
> **Goal**: Convert the existing Obsidian Mirror from passive code visualization into the **single source of truth for KLOEL's path-to-production**, consumed by Daniel (visual) and Claude/OpenCode (textual hub notes) without drift.

---

## Decisions ratified

| #   | Decision               | Choice                                                                     |
| --- | ---------------------- | -------------------------------------------------------------------------- |
| 1   | Blocker-rank algorithm | `score = tier_weight × phase_priority × user_impact × (1/effort_estimate)` |
| 2   | Provider healthchecks  | Phase 1: read PULSE/CI only. Phase 2 (later): real pings with test keys    |
| 3   | Tier classification    | Dynamic inference from PULSE (no static seed)                              |
| ∗   | Execution model        | All heavy work via OpenCode V4 Pro subagents in parallel waves             |

---

## Tag namespace (extend existing)

Existing (daemon-locked): `graph/surface-*`, `graph/effect-*`, `graph/risk-*`, `graph/governance`, `graph/orphan`, `graph/molecule`, `graph/proof-test`, `mirror/metadata-only`, `source/pulse-machine`, `signal/*`, `workspace/dirty`, `findings/severity-*` (added 2026-05-02 by us).

**New (this plan adds):**

- `kloel/tier-1` … `kloel/tier-4` — derived from PULSE
- `kloel/phase-0` … `kloel/phase-6` — derived from CLAUDE.md DAG + PULSE module mapping
- `coverage/below-threshold` — file-level coverage < 80%
- `ci/failing`, `ci/passing` — applied only to anchor files (`.github/workflows/ci-cd.yml`, key configs)
- `provider/healthy`, `provider/degraded`, `provider/down` — applied to synthetic provider hub notes

Color palette extends `scripts/orchestration/extend-graph-lens.mjs` (non-protected, already exists).

---

## Sidecar schemas (all `kloel.*.v1`)

All sidecars sit next to mirror nodes in `_source/<repo-rel>.<kind>.json`. Non-protected. Atomic write (tmp + rename).

```json
// <file>.tier.json
{ "schema": "kloel.tier.v1", "tier": 1|2|3|4, "evidence": ["pulse:..."], "computedAt": "ISO8601" }

// <file>.phase.json
{ "schema": "kloel.phase.v1", "phase": 0|1|2|3|4|5|6, "module": "string", "evidence": ["..."] }

// <file>.coverage.json
{ "schema": "kloel.coverage.v1", "lines": { "covered": int, "total": int, "pct": float },
  "branches": { ... }, "lastRun": "ISO8601", "source": "lcov|jest" }

// global ci-state.json (in vault root, not per-file)
{ "schema": "kloel.ci.v1", "lastRun": "...", "runs": [{ "name", "status", "url" }] }

// global provider-state.json
{ "schema": "kloel.provider.v1", "providers": [
  { "name": "stripe", "status": "healthy|degraded|down", "lastCheck": "...",
    "evidence": ["pulse:...", "ci:..."], "phase2Ping": null /* reserved */ }
]}
```

---

## Hub notes (auto-generated, non-protected, regenerated on every refresh)

Path: `<vault>/Kloel/00-HUD/`. Each hub is a `.md` with frontmatter tags + Obsidian embedded queries + a ranked table. Always overwritable (header marker `<!-- AUTO-GENERATED — do not edit -->`).

| Hub                 | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `00-NEXT.md`        | The 3 next tasks. First file Claude reads.      |
| `00-BLOCKERS.md`    | Full ranked queue, top 50.                      |
| `00-DAG.md`         | Phase progress bars + module status table.      |
| `00-REGRESSIONS.md` | What changed for the worse since last snapshot. |
| `00-PROVIDERS.md`   | Stripe / Meta / WAHA / etc. health.             |
| `00-HUD-README.md`  | Map + last-refresh timestamp.                   |

A daily snapshot is dropped at `<vault>/Kloel/00-HUD/snapshots/YYYY-MM-DD.md` for time-series.

---

## Blocker-rank algorithm (canonical)

Implemented in `scripts/orchestration/blocker-rank.mjs`. Reads all sidecars + PULSE_REPORT.md + Codacy ratchet. Outputs `<repo>/BLOCKER_RANK.json` (gitignored).

```
score(file) = tier_weight × phase_priority × user_impact × (1 / effort_estimate)

tier_weight:
  tier-1 (≥80% functional, last-mile blockers) = 4.0   // ship-critical
  tier-2 (partial)                              = 3.0
  tier-3 (façade)                               = 2.0
  tier-4 (shell)                                = 1.0

phase_priority: FASE 0=10, FASE 1=8, FASE 2=6, FASE 3=4, FASE 4=2, FASE 5=1, FASE 6=1

user_impact: derived from PULSE
  - hits a user route or api endpoint = 5
  - hits a service consumed by route = 4
  - financial/auth/messaging surface  = 5 (override)
  - dev infra only                    = 1

effort_estimate (hours):
  effort = max(0.5, (LOC/100) + (open_findings_count/3) + (complexity/15))
  open_findings_count = severity-weighted (critical=4, high=2, medium=1, low=0.5)

# Tiebreaker: for equal scores, prefer files in modules already > 60% complete (closer to ship)
```

`00-NEXT.md` shows only the top 3, with: path, line, reason (top finding), effort, phase, tier, evidence link.

---

## Wave plan (atomized for OpenCode dispatch)

### Wave 1 — sidecar emitters (5 parallel)

| Subagent | New file                                             | Reads                                                                                | Writes                                                                                                          |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **E1**   | `scripts/orchestration/tier-tags-emitter.mjs`        | `PULSE_REPORT.md` + `pulse/*.json`                                                   | `<file>.tier.json` sidecars + injects `kloel/tier-N` into mirror frontmatter via `rewriteMirrorFrontmatterTags` |
| **E2**   | `scripts/orchestration/phase-tags-emitter.mjs`       | CLAUDE.md DAG + PULSE module mapping                                                 | `<file>.phase.json` + `kloel/phase-N` tag                                                                       |
| **E3**   | `scripts/orchestration/coverage-sidecar-emitter.mjs` | `coverage/lcov.info`, `coverage/coverage-final.json` from `backend/` and `frontend/` | `<file>.coverage.json` + `coverage/below-threshold` tag (when pct < 80)                                         |
| **E4**   | `scripts/orchestration/ci-state-emitter.mjs`         | `gh run list --json` (latest 10 runs)                                                | global `ci-state.json` + `ci/failing                                                                            | passing` on anchor files |
| **E5**   | `scripts/orchestration/provider-state-emitter.mjs`   | PULSE provider sections + recent CI logs (Phase 1 only — no live pings)              | global `provider-state.json`                                                                                    |

All emitters: idempotent · `--dry` flag · stderr summary · atomic write · skip if no change.

### Wave 2 — synthesis (sequential)

| Subagent | New file                                   | Depends on                                      |
| -------- | ------------------------------------------ | ----------------------------------------------- |
| **R1**   | `scripts/orchestration/blocker-rank.mjs`   | All Wave 1 sidecars + `FINDINGS_AGGREGATE.json` |
| **H1**   | `scripts/orchestration/hubs-generator.mjs` | R1 + Wave 1 sidecars + CLAUDE.md DAG            |

`R1` writes `BLOCKER_RANK.json` at repo root (gitignored). `H1` regenerates the 6 hub notes in the vault.

### Wave 3 — polish (3 parallel)

| Subagent | Action                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1**   | Extend `scripts/orchestration/extend-graph-lens.mjs` with the new tag→colorGroups (tier-N: gradient red→green; phase-N: spectrum violet→cyan; coverage/below-threshold: yellow; ci/failing: bright-red; provider/down: black) |
| **W1**   | Build `scripts/orchestration/hud-orchestrator.mjs` — single entrypoint that runs all emitters → blocker-rank → hubs → lens. CLI: `--once`, `--watch`. Wire into `findings-watch.mjs` post-aggregate hook                      |
| **D1**   | Write `docs/adr/0004-obsidian-as-production-hud.md` (architecture decision record) + `<vault>/Kloel/00-HUD/00-HUD-README.md` (operator guide)                                                                                 |

---

## Acceptance criteria

A wave is done only when:

**Wave 1 done** when:

- Each emitter runs in `--dry` and prints a summary without errors
- Each emitter, run live, produces ≥ 1 sidecar of its kind
- Mirror frontmatter shows new tags on at least one file (verified by grep)

**Wave 2 done** when:

- `BLOCKER_RANK.json` exists with `≥ 5` ranked entries
- Top entry has all required fields: file, line, score breakdown, evidence
- All 6 hub notes exist in vault with auto-gen marker

**Wave 3 done** when:

- `graph.json` colorGroups count ≥ 40 (32 current + 4 tier + 7 phase + few state)
- `node scripts/orchestration/hud-orchestrator.mjs --once` completes in < 60s
- ADR + HUD README committed
- Reopening Obsidian Graph view shows tier/phase coloring on actual files

**Mission done** when:

- Daniel can open `<vault>/Kloel/00-HUD/00-NEXT.md` and see the actual top-3 next tasks
- Claude can read that same file as the first action of any new session and decide what to do in < 200 tokens
- 4/4 mirror-acceptance-tests still pass (no regression on findings pipeline)

---

## Constitution compliance

- No protected file edits. All `scripts/obsidian-mirror-daemon*.mjs` and `scripts/obsidian-graph-lens.mjs` are read-only; we IMPORT exported helpers (`rewriteMirrorFrontmatterTags`).
- No `git restore`. Forbidden.
- No `// eslint-disable`, `@ts-ignore`, `biome-ignore`, codacy-skip. Fix root causes.
- `package.json` script additions need governance approval at push time — subagents add them (commits succeed; pre-push will gate).
- Each subagent commits its own deliverable (`feat(hud): <subagent>`) for clean revertability.

---

## Out of scope (deferred)

- Phase 2 provider live pings with test keys
- Real-time CI listening (we poll `gh` not webhook)
- Custom Obsidian plugin for multi-dot per node — current 1-color-per-node is acceptable
- Mobile vault sync optimization
- Time-series visualization beyond daily snapshot dump

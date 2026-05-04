# KLOEL HUD — Operator Guide

> **Status**: in use | **ADR**: [ADR-0004](./adr/0004-obsidian-as-production-hud.md) |
> **Last updated**: 2026-05-02

The KLOEL HUD (Heads-Up Display) is the **single source of truth** for the
project's path-to-production state. It surfaces ~15 data sources (PULSE findings,
CI outcomes, coverage, provider health, dependency changes, blocker ranking) into
an Obsidian vault consumed by both Daniel (visual: Graph, Canvas, Bases) and
Claude/OpenCode AI agents (textual: MCP tools, hub notes).

---

## 1. What is the HUD

The HUD is the Obsidian vault at `~/Documents/Obsidian Vault/Kloel/` operating
as a **programmable state-machine surface**. It ingests raw signals from the
codebase (mirror daemon), enriches them (sidecar emitters), synthesizes
prioritized action items (blocker rank + hubs-generator), and exposes everything
through two consumption paths — visual (for humans) and textual MCP (for AI
agents).

For the full architectural rationale, see
[ADR-0004](./adr/0004-obsidian-as-production-hud.md).

### The four-layer architecture

```
Layer 1 — Constitution-locked daemon    (scripts/obsidian-mirror-daemon*.mjs)
Layer 2 — Sidecar emitters + watches    (scripts/orchestration/*-emitter.mjs)
Layer 3 — Auto-generated hub notes      (<vault>/Kloel/00-HUD/00-*.md)
Layer 4 — AI-agent MCP doorway          (cyanheads obsidian-mcp + engraph)
```

### What the HUD answers

| Question                    | Source                                      |
| --------------------------- | ------------------------------------------- |
| What do I work on next?     | `00-NEXT.md` (top-3 ranked blockers)        |
| What's blocking us, ranked? | `00-BLOCKERS.md` (top-50)                   |
| Where are we across phases? | `00-DAG.md` (Mermaid Gantt + progress bars) |
| Are providers healthy?      | `00-PROVIDERS.md` (Stripe/Meta/WAHA etc.)   |
| What got worse?             | `00-REGRESSIONS.md` (diff vs last snapshot) |

---

## 2. Quick start

### One-time setup

```bash
# 1. Run PULSE to generate fresh findings
npm run pulse

# 2. Run the full HUD refresh (emitters → blocker-rank → hubs → graph)
node scripts/orchestration/hud-orchestrator.mjs --once

# 3. Open Obsidian
open "/Users/danielpenin/Documents/Obsidian Vault"
```

The Obsidian Homepage plugin opens to `00-NEXT.md` automatically. If it doesn't,
navigate to `Kloel/00-HUD/00-NEXT.md`.

### Verify everything is healthy

```bash
# Full audit — 10 categories, markdown report to stdout
node scripts/orchestration/hud-audit.mjs --once

# JSON output for scripting
node scripts/orchestration/hud-audit.mjs --once --json

# Single category
node scripts/orchestration/hud-audit.mjs --once --category E
```

### Refresh on demand

```bash
# Full pipeline (same as the watch loop does on file changes)
node scripts/orchestration/hud-orchestrator.mjs --once

# Check status of last refresh
node scripts/orchestration/hud-orchestrator.mjs --status

# Dry run (no writes)
node scripts/orchestration/hud-orchestrator.mjs --once --dry

# Watch mode (re-runs every 5 min on file changes)
node scripts/orchestration/hud-orchestrator.mjs --watch
```

---

## 3. Daemons

The HUD requires four long-running processes. Each uses a PID file in `/tmp/`
for singleton enforcement.

### 3.1 Obsidian Mirror Daemon

Constitution-locked. Mirrors the git working tree into the vault at
`<vault>/Kloel/99 - Espelho do Codigo/_source/`. Every source file becomes a
markdown note with frontmatter tags.

| Property         | Value                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| **Entry point**  | `scripts/obsidian-mirror-daemon.mjs`                                           |
| **PID file**     | No PID lock (managed by launchd / tmux)                                        |
| **Constitution** | **READ-ONLY TO AI** — no agent may edit any `obsidian-mirror-daemon*.mjs` file |
| **Guardrail**    | Never mutates code; only mirrors                                               |
| **Output**       | `_source/<relative-path>.md` per tracked file                                  |

### 3.2 Findings Watch

Watches the repo for file changes and updates findings in near real time.
Uses a **fast lane** (scoped ESLint on the changed file, ~300ms debounce) and
a **slow lane** (full aggregate + sidecar emit, 30s throttle).

| Property        | Value                                                         |
| --------------- | ------------------------------------------------------------- |
| **Entry point** | `scripts/orchestration/findings-watch.mjs --start`            |
| **PID file**    | `/tmp/kloel-findings-watch.pid`                               |
| **npm alias**   | `npm run findings:watch`                                      |
| **One-shot**    | `npm run findings:once`                                       |
| **Pause**       | `node scripts/orchestration/findings-watch.mjs --pause`       |
| **Resume**      | `node scripts/orchestration/findings-watch.mjs --resume`      |
| **Full rescan** | `node scripts/orchestration/findings-watch.mjs --rescan-full` |
| **Output**      | `FINDINGS_AGGREGATE.json` + `<file>.findings.json` sidecars   |

### 3.3 Graph Color Watchdog

Obsidian overwrites `graph.json` `colorGroups` to `[]` when the Graph view is
closed. The watchdog detects this via `fs.watch` + 5s poll and re-applies the
factory lens + extend-graph-lens.

| Property            | Value                                                               |
| ------------------- | ------------------------------------------------------------------- |
| **Entry point**     | `scripts/orchestration/graph-color-watchdog.mjs --start`            |
| **PID file**        | `/tmp/kloel-graph-color-watchdog.pid`                               |
| **Stop**            | `node scripts/orchestration/graph-color-watchdog.mjs --stop`        |
| **Status**          | `node scripts/orchestration/graph-color-watchdog.mjs --status`      |
| **Expected groups** | 50 colorGroups (severity + tier + phase + coverage + CI + provider) |
| **Backoff**         | 1s between re-apply attempts                                        |

### 3.4 HUD Orchestrator (watch mode)

When run with `--watch`, the orchestrator runs the full 12-step pipeline
every N minutes (default 5) when source tree changes are detected via SHA-256
hashing of all tracked files.

### Daemon lifecycle

```bash
# Check all daemon statuses
node scripts/orchestration/graph-color-watchdog.mjs --status

# findings-watch has its own status via PID file
# hud-orchestrator status
node scripts/orchestration/hud-orchestrator.mjs --status

# Kill by PID (or use --stop for graph-color-watchdog)
kill $(cat /tmp/kloel-findings-watch.pid | jq -r .pid)
kill $(cat /tmp/kloel-graph-color-watchdog.pid | jq -r .pid)
kill $(cat /tmp/kloel-hud-orchestrator.pid)
```

### Restart after reboot

All daemons need to be restarted after a system reboot. The fastest way:

```bash
npm run findings:watch &
node scripts/orchestration/graph-color-watchdog.mjs --start &
node scripts/orchestration/hud-orchestrator.mjs --watch &
```

---

## 4. Sidecars — schema reference

Sidecar JSON files live alongside mirror `.md` nodes in
`<vault>/Kloel/99 - Espelho do Codigo/_source/`. Each has a versioned schema.

### `kloel.tier.v1` — `<file>.tier.json`

Module maturity tier (1–4), computed by `tier-tags-emitter.mjs`.

```json
{
  "schema": "kloel.tier.v1",
  "tier": 2,
  "evidence": ["PULSE: 72% functional coverage", "route registered in app.module"],
  "computedAt": "2026-05-02T21:00:00.000Z"
}
```

Tier definitions:

- **tier-1**: >= 80% functional. Last-mile blockers before ship.
- **tier-2**: Partial implementation (40–79%).
- **tier-3**: Facade/skeleton only.
- **tier-4**: Shell — no implementation beyond boilerplate.

### `kloel.phase.v1` — `<file>.phase.json`

Phase assignment (0–6) from `CLAUDE.md` DAG, written by `phase-tags-emitter.mjs`.

```json
{
  "schema": "kloel.phase.v1",
  "phase": 2,
  "module": "WhatsApp",
  "evidence": ["CLAUDE.md DAG: WhatsApp ∈ FASE 2 COMUNICACAO"],
  "computedAt": "2026-05-02T21:00:00.000Z"
}
```

Phases:
| # | Name | Modules |
|---|---|---|
| 0 | INFRAESTRUTURA | Auth, Workspaces, Settings, KYC |
| 1 | MOTOR COMERCIAL | Products, Checkout, Wallet, Billing |
| 2 | COMUNICACAO | WhatsApp, Inbox, Autopilot, Flows |
| 3 | INTELIGENCIA | CIA, CRM, Dashboard, Analytics, Reports |
| 4 | CRESCIMENTO | Vendas, Affiliate, Member Area, Campaigns, FollowUps |
| 5 | PLATAFORMA AVANCADA | Marketing, Anuncios, Sites, Canvas, Funnels, Webinarios, Leads |
| 6 | OPERACIONAL | Team, API Keys, Webhooks, Audit Log, Notifications, Marketplace, Video |

### `kloel.coverage.v1` — `<file>.coverage.json`

Per-file test coverage from Jest `lcov.info` / `coverage-final.json`, written by
`coverage-sidecar-emitter.mjs`.

```json
{
  "schema": "kloel.coverage.v1",
  "lines": { "covered": 84, "total": 120, "pct": 70.0 },
  "branches": { "covered": 22, "total": 40, "pct": 55.0 },
  "functions": { "covered": 10, "total": 14, "pct": 71.4 },
  "statements": { "covered": 90, "total": 130, "pct": 69.2 },
  "lastRun": "2026-05-02T20:45:00.000Z",
  "source": "jest",
  "belowThreshold": true
}
```

### `kloel.findings.v1` — `<file>.findings.json`

Per-file findings from all engines (eslint, PULSE parsers, etc.), written by
`emit-findings-sidecars.mjs` and `findings-watch.mjs` (fast lane).

```json
{
  "schema": "kloel.findings.v1",
  "file": "backend/src/whatsapp/whatsapp.service.ts",
  "generatedAt": "2026-05-02T21:00:00.000Z",
  "count": 12,
  "dominantSeverity": "high",
  "severityCounts": { "critical": 2, "high": 5, "medium": 3, "low": 2 },
  "categories": ["lint", "security", "type-safety"],
  "findings": [
    {
      "line": 142,
      "column": 5,
      "category": "security",
      "severity": "critical",
      "engine": "eslint",
      "rule": "@typescript-eslint/no-unsafe-argument",
      "message": "Unsafe argument of type `any` assigned to a parameter of type `string`.",
      "fingerprint": "a1b2c3d4e5f6a7b8"
    }
  ]
}
```

### `kloel.ci.v1` — `.hud/ci-state.json`

Global CI state from GitHub Actions (latest 10 runs on current branch), written
by `ci-state-emitter.mjs`.

```json
{
  "schema": "kloel.ci.v1",
  "aggregate": "passing",
  "branch": "main",
  "lastRun": "2026-05-02T21:00:00.000Z",
  "runs": [
    {
      "name": "CI / Build & Test",
      "status": "completed",
      "conclusion": "success",
      "url": "https://github.com/...",
      "createdAt": "2026-05-02T20:30:00Z"
    }
  ]
}
```

### `kloel.provider.v1` — `.hud/provider-state.json`

Provider health check (read-only Phase 1 — scans PULSE report mentions + CI logs
for error patterns), written by `provider-state-emitter.mjs`.

```json
{
  "schema": "kloel.provider.v1",
  "generatedAt": "2026-05-02T21:00:00.000Z",
  "providers": [
    {
      "name": "stripe",
      "status": "healthy",
      "lastCheck": "2026-05-02T21:00:00.000Z",
      "evidence": ["No Stripe errors in CI logs (last 24h)"]
    }
  ]
}
```

### `kloel.blocker-rank.v1` — `BLOCKER_RANK.json`

Ranked blocker queue, written by `blocker-rank.mjs` at the repo root.
Gitignored — regenerated on every HUD refresh.

```json
{
  "schema": "kloel.blocker-rank.v1",
  "generatedAt": "2026-05-02T21:00:00.000Z",
  "total": 150,
  "topN": [
    {
      "rank": 1,
      "file": "backend/src/whatsapp/whatsapp.service.ts",
      "tier": 2,
      "phase": 2,
      "score": 196.7,
      "topFinding": { "line": 142, "message": "..." },
      "severityCounts": { "critical": 2, "high": 5, "medium": 3, "low": 2 },
      "breakdown": {
        "tier_weight": 3.0,
        "phase_priority": 6,
        "user_impact": 5,
        "effort_hours": 2.29
      }
    }
  ]
}
```

---

## 5. Hub notes

Six auto-generated markdown files in `<vault>/Kloel/00-HUD/`. All carry the
`<!-- AUTO-GENERATED — do not edit -->` marker. The `hubs-generator.mjs` checks
this marker on every refresh — if a hub has been human-edited (marker absent),
the generator aborts with a warning.

### 00-NEXT.md

**Purpose**: First file Claude reads on session start. Top 3 next tasks.
**Source**: `BLOCKER_RANK.json` (top 3).
**Consumer**: Claude/OpenCode, Daniel.

### 00-BLOCKERS.md

**Purpose**: Full ranked blocker queue (top 50 files).
**Source**: `BLOCKER_RANK.json`.
**Consumer**: Daniel (at-a-glance triage), Claude (deep dives).

### 00-DAG.md

**Purpose**: Phase progress from `CLAUDE.md` DAG. Includes Mermaid Gantt chart
and per-phase completion percentages.
**Source**: `BLOCKER_RANK.json` + `CLAUDE.md` DAG module mapping.
**Consumer**: Daniel (visual progress), Claude.

### 00-PROVIDERS.md

**Purpose**: Provider health table (Stripe, Meta, WAHA, Google, Bling,
Cloudflare, Sentry, MercadoPago, Supabase, Railway, Vercel).
**Source**: `provider-state.json`.
**Consumer**: Daniel, Claude.

### 00-REGRESSIONS.md

**Purpose**: What changed for the worse since the last daily snapshot.
**Source**: Diff between current snapshot and previous in
`<vault>/Kloel/00-HUD/snapshots/`.
**Consumer**: Daniel.

### 00-HUD-README.md

**Purpose**: In-vault operator guide (auto-generated counterpart to this file).
**Source**: `hubs-generator.mjs` static template.
**Consumer**: Onboarding reference inside Obsidian.

---

## 6. MCP doorways

AI agents (Claude, OpenCode) access the vault exclusively via MCP tools — not
filesystem reads. Two MCP servers provide the bridge:

### 6.1 cyanheads/obsidian-mcp-server@3.1.1

Primary MCP bridge for vault CRUD and Dataview queries.

| Property                    | Detail                                                          |
| --------------------------- | --------------------------------------------------------------- |
| **Transport**               | stdio (`npx obsidian-mcp-server@latest`)                        |
| **Backend**                 | HTTPS port 27124 → `obsidian-local-rest-api` plugin             |
| **Requires Obsidian open?** | Yes                                                             |
| **Tools**                   | 12 (read, write, search, frontmatter, tags, delete, open-in-UI) |
| **Resources**               | 3 (vault notes, tags, status)                                   |
| **Setup doc**               | `scripts/orchestration/OBSIDIAN_MCP_SETUP.md`                   |

**Verify**:

```bash
# 1. Check REST API plugin is running (Obsidian must be open):
curl -sk https://127.0.0.1:27124/
# Expected: 401 (healthy — auth required)

# 2. In Claude/OpenCode:
/list-mcp-tools obsidian
# Expected: 12 tools listed

# 3. Quick smoke:
# Ask Claude: "read the file Kloel/00-HUD/00-NEXT.md"
```

### 6.2 devwhodevs/engraph (W6.1)

Secondary MCP layer — local knowledge graph with hybrid search.

| Property                    | Detail                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| **Transport**               | stdio (`engraph serve`)                                             |
| **Backend**                 | SQLite + llama.cpp (Metal GPU) directly                             |
| **Requires Obsidian open?** | No                                                                  |
| **Tools**                   | 25 (8 read, 10 write, 2 identity, 1 index, 1 diagnostic, 3 migrate) |
| **REST endpoints**          | 26                                                                  |
| **Install**                 | `brew install devwhodevs/tap/engraph`                               |
| **Setup doc**               | `scripts/orchestration/OBSIDIAN_MCP_SETUP.md` (second half)         |

**Verify**:

```bash
# 1. Index (first run downloads ~334MB embedding model):
engraph index "/Users/danielpenin/Documents/Obsidian Vault"

# 2. Check status:
engraph status --json

# 3. In Claude/OpenCode:
/list-mcp-tools engraph
# Expected: 25 tools listed
```

### 6.3 getsentry/sentry-mcp (W8.2)

Production error monitoring — 22 tools for issue search, event analysis, and
triage.

| Property      | Detail                                                     |
| ------------- | ---------------------------------------------------------- |
| **Transport** | stdio (`npx @sentry/mcp-server@latest`)                    |
| **Backend**   | Sentry REST API (sentry.io)                                |
| **Tools**     | 22 (including AI-powered `search_issues`, `search_events`) |
| **Setup doc** | `scripts/orchestration/SENTRY_MCP_SETUP.md`                |

**Verify**:

```bash
SENTRY_ACCESS_TOKEN=<your-token> npx -y @sentry/mcp-server@latest
# In Claude/OpenCode:
/list-mcp-tools sentry
```

### Coexistence

`cyanheads/obsidian-mcp-server` and `engraph` complement each other without
conflict:

| Aspect        | cyanheads (obsidian)        | engraph                                |
| ------------- | --------------------------- | -------------------------------------- |
| Tool prefix   | `obsidian_*`                | No prefix                              |
| Best for      | CRUD, frontmatter, Dataview | Semantic/graph search, context bundles |
| Token economy | ~80 tokens/read             | ~200 tokens/search                     |

---

## 7. Validation — hud-audit

The HUD audit (`scripts/orchestration/hud-audit.mjs`) runs 10 audit categories
that validate the entire HUD stack from baseline files to pulse engines.

### Audit categories

| Cat | Name           | What it checks                                                                      |
| --- | -------------- | ----------------------------------------------------------------------------------- |
| A   | baseline-files | Key scripts exist (severity-tags-emitter, extend-graph-lens, watchdog)              |
| B   | wave1-emitters | Sidecar counts >= thresholds, ci-state.json + provider-state.json valid             |
| C   | wave2-rank     | BLOCKER_RANK.json schema valid, topN populated                                      |
| D   | wave3-polish   | hud-orchestrator --dry exit 0, ADR-0004 >= 500 lines, extend-graph-lens kloel_added |
| E   | mcp-doorway    | REST API plugin + manifest + API key + Obsidian running + MCP config entry          |
| F   | plugins        | community-plugins.json >= 12 entries, each plugin id/manifest/main.js valid         |
| G   | plugin-config  | Homepage → 00-NEXT, Linter ignores Espelho, Periodic Notes → snapshots              |
| H   | wave6-bundles  | devops-companion + obsidian-git installed, vault is git repo                        |
| I   | theme          | kloel-theme.css in snippets, enabled in appearance.json                             |
| J   | pulse-engines  | pulse-bridge --dry exit 0, 8 findings engines in PATH, REQUIREMENTS.md exists       |

### Usage

```bash
# Full audit (markdown to stdout)
node scripts/orchestration/hud-audit.mjs --once

# JSON output for scripting
node scripts/orchestration/hud-audit.mjs --once --json

# Single category
node scripts/orchestration/hud-audit.mjs --once --category E

# Fix orphan sidecars (sidecars without parent .md files)
node scripts/orchestration/hud-audit.mjs --fix-orphans

# Dry-run orphan detection
node scripts/orchestration/hud-audit.mjs --fix-orphans --dry

# Exit code: 0 = no failures, 1 = failures found
```

---

## 8. Failure modes and recovery

### 8.1 Watchdog dies

**Symptom**: Graph view shows default colours instead of KLOEL colour groups.
`graph.json` `colorGroups` is `[]`.

**Root cause**: `graph-color-watchdog.mjs` process terminated (reboot, OOM kill,
manual SIGKILL).

**Recovery**:

```bash
# Check if running
node scripts/orchestration/graph-color-watchdog.mjs --status

# Restart
node scripts/orchestration/graph-color-watchdog.mjs --start &

# Verify after ~5s (poll interval)
# Open Obsidian Graph view → should show colour groups
```

### 8.2 graph.json wiped / colour groups lost

**Symptom**: Graph is monochrome or missing clusters.

**Root cause**: Obsidian overwrites `graph.json` on Graph view close. The
watchdog normally catches this within 5s but may have been stopped. Alternatively,
an Obsidian update may have changed the `graph.json` schema.

**Recovery**:

```bash
# Manual re-apply
node scripts/obsidian-graph-lens.mjs --factory
node scripts/orchestration/extend-graph-lens.mjs

# Or via npm alias
npm run colors:apply

# Verify with audit
node scripts/orchestration/hud-audit.mjs --once --category D
```

### 8.3 Subagent hangs

**Symptom**: An OpenCode subagent running an emitter or fix step has not
produced output after 3+ minutes.

**Recovery**:

```bash
# 1. Find the subagent PID
ps aux | grep opencode

# 2. Preserve last output
# Check artifacts/opencode-fleet/<runId>/ for partial output

# 3. Kill
kill -TERM <pid>

# 4. Relaunch the specific step
# If it was part of the orchestration pipeline, re-run just that step:
node scripts/orchestration/<step-name>.mjs --emit
```

### 8.4 MCP connection refused / Obsidian not running

**Symptom**: Claude/OpenCode tools fail with "Connection refused" when
calling obsidian MCP tools.

**Root cause**: Obsidian is not running, the Local REST API plugin is disabled,
or the API key is wrong/expired.

**Recovery**:

```bash
# 1. Verify Obsidian is running
pgrep -l Obsidian

# 2. Check REST API health
curl -sk https://127.0.0.1:27124/
# Expected: 401 (healthy) or 200 (if header auth passed)

# 3. Check plugin is enabled
node scripts/orchestration/hud-audit.mjs --once --category E

# 4. If API key is wrong, regenerate in Obsidian:
# Settings → Community Plugins → Local REST API → Generate API Key
# Then update ~/.claude.json with the new key

# 5. If engraph is down:
engraph status --json
# If "not indexed", run: engraph index "/Users/danielpenin/Documents/Obsidian Vault"
```

### 8.5 Phase orphan sidecars

**Symptom**: Sidecar JSON files exist without corresponding parent `.md` mirror
files. Audit category B reports orphan counts.

**Root cause**: Mirror daemon removed an `.md` file (source file deleted) but
the sidecar emitter didn't clean up the corresponding sidecar JSON.

**Recovery**:

```bash
# 1. Detect
node scripts/orchestration/hud-audit.mjs --fix-orphans --dry

# 2. Clean up
node scripts/orchestration/hud-audit.mjs --fix-orphans
```

### 8.6 Findings aggregate stale / corrupt

**Symptom**: `FINDINGS_AGGREGATE.json` is missing, empty, or has
`generatedAt` older than 1 hour.

**Recovery**:

```bash
# Full regeneration
npm run findings:full

# Or if findings-watch daemon is running, request rescan:
node scripts/orchestration/findings-watch.mjs --rescan-full
```

### 8.7 Blocker rank missing

**Symptom**: `BLOCKER_RANK.json` doesn't exist. Hub notes can't generate.

**Recovery**:

```bash
# Regenerate manually
node scripts/orchestration/blocker-rank.mjs --emit

# Then re-run hubs
node scripts/orchestration/hubs-generator.mjs --emit

# Or run the full pipeline
node scripts/orchestration/hud-orchestrator.mjs --once
```

### 8.8 HUD orchestrator hard failure

**Symptom**: The orchestrator stops after a required step exits non-zero.

**Recovery**:

```bash
# 1. Check which step failed
node scripts/orchestration/hud-orchestrator.mjs --status

# 2. Run just the failed step manually to see the error:
node scripts/orchestration/<failed-step>.mjs

# 3. Re-run orchestration after fixing:
node scripts/orchestration/hud-orchestrator.mjs --once
```

---

## 9. Glossary

| Term                    | Definition                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **workspace**           | A directory containing `eslint.config.mjs`: `backend/`, `frontend/`, `frontend-admin/`, `worker/`                            |
| **dirty workspace**     | A workspace with open findings (any severity). Clean = zero findings.                                                        |
| **finding**             | A single issue detected by an engine (eslint, PULSE parser, etc.). Has a fingerprint for dedup.                              |
| **severity**            | `critical` > `high` > `medium` > `low`. Weighted for scoring.                                                                |
| **tier**                | Module maturity: 1 (>=80% functional, last-mile) > 2 (partial) > 3 (facade) > 4 (shell).                                     |
| **phase**               | 0–6 grouping from `CLAUDE.md` DAG. Lower = earlier in production path.                                                       |
| **blocker**             | A file with findings, ranked by `blocker-rank.mjs` scoring algorithm.                                                        |
| **blocker rank**        | Weighted score = tier_weight × phase_priority × user_impact × (1 / effort_hours).                                            |
| **sidecar**             | A JSON file (`<file>.<schema>.json`) alongside a mirror `.md` node, carrying metadata.                                       |
| **orphan sidecar**      | A sidecar without a corresponding `.md` mirror file (source was deleted).                                                    |
| **hub note**            | Auto-generated markdown in `00-HUD/`. Overwritten on every HUD refresh.                                                      |
| **mirror**              | A markdown copy of a source file in the vault, maintained by the constitution-locked daemon.                                 |
| **constitution-locked** | READ-ONLY to AI agents. No agent may edit, weaken, bypass, or replace.                                                       |
| **MCP doorway**         | The stdio-to-HTTP bridge that lets Claude/OpenCode access the vault via tool calls.                                          |
| **engraph**             | Local knowledge graph (SQLite + llama.cpp) for semantic/hybrid search across the vault.                                      |
| **kloel_added**         | The signal emitted by `extend-graph-lens.mjs` when it successfully writes colorGroups.                                       |
| **PULSE**               | The static auditing framework (`scripts/pulse/`). 50+ parsers, read-only on the codebase.                                    |
| **findings engine**     | A single tool that produces findings: eslint, yamllint, actionlint, shellcheck, hadolint, gitleaks, depcheck, markdownlint.  |
| **fast lane**           | Scoped ESLint on a single changed file (~300ms after change). Updates aggregate + sidecar directly.                          |
| **slow lane**           | Full re-aggregate + sidecar emit of all files (30s throttle, trailing edge).                                                 |
| **PID file**            | Singleton lock in `/tmp/`. Ensures only one instance of a daemon runs at a time. JSON: `{"pid": 12345, "startedAt": "..."}`. |
| **`_source/`**          | The vault directory where mirrored source files and sidecars live.                                                           |
| **`.hud/`**             | Subdirectory of `_source/` for global HUD artifacts (`ci-state.json`, `provider-state.json`).                                |
| **auto-gen marker**     | `<!-- AUTO-GENERATED — do not edit -->` — hub notes carry this. The generator refuses to overwrite files without it.         |

---

## Appendix A — Orchestrator pipeline steps

The 12 steps executed by `hud-orchestrator.mjs --once`:

| #   | Step                        | Script                                                                                      | Optional |
| --- | --------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| 1   | aggregate-findings          | `scripts/ops/aggregate-findings.mjs`                                                        | No       |
| 2   | emit-findings-sidecars      | `scripts/ops/emit-findings-sidecars.mjs`                                                    | No       |
| 3   | severity-tags-emitter       | `scripts/orchestration/severity-tags-emitter.mjs`                                           | No       |
| 4   | tier-tags-emitter           | `scripts/orchestration/tier-tags-emitter.mjs`                                               | No       |
| 5   | phase-tags-emitter          | `scripts/orchestration/phase-tags-emitter.mjs`                                              | No       |
| 6   | coverage-sidecar-emitter    | `scripts/orchestration/coverage-sidecar-emitter.mjs`                                        | No       |
| 7   | ci-state-emitter            | `scripts/orchestration/ci-state-emitter.mjs`                                                | No       |
| 8   | provider-state-emitter      | `scripts/orchestration/provider-state-emitter.mjs`                                          | No       |
| 9   | pulse-bridge-emitter        | `scripts/orchestration/pulse-bridge-emitter.mjs`                                            | Yes      |
| 10  | blocker-rank                | `scripts/orchestration/blocker-rank.mjs`                                                    | Yes      |
| 11  | hubs-generator              | `scripts/orchestration/hubs-generator.mjs`                                                  | Yes      |
| 12  | graph-lens-factory + extend | `scripts/obsidian-graph-lens.mjs --factory` + `scripts/orchestration/extend-graph-lens.mjs` | No       |

## Appendix B — Key files and paths

| Path                                                 | Description                                  |
| ---------------------------------------------------- | -------------------------------------------- |
| `docs/adr/0004-obsidian-as-production-hud.md`        | Architectural decision record                |
| `docs/HUD_README.md`                                 | This file                                    |
| `scripts/orchestration/hud-orchestrator.mjs`         | Main pipeline runner                         |
| `scripts/orchestration/hud-audit.mjs`                | Validation audit                             |
| `scripts/orchestration/findings-watch.mjs`           | Findings daemon (fast + slow lane)           |
| `scripts/orchestration/graph-color-watchdog.mjs`     | Graph colour daemon                          |
| `scripts/orchestration/hubs-generator.mjs`           | Hub note generator (H1)                      |
| `scripts/orchestration/blocker-rank.mjs`             | Blocker ranking engine (R1)                  |
| `scripts/orchestration/tier-tags-emitter.mjs`        | Tier tag emitter (E1)                        |
| `scripts/orchestration/phase-tags-emitter.mjs`       | Phase tag emitter (E2)                       |
| `scripts/orchestration/coverage-sidecar-emitter.mjs` | Coverage emitter (E3)                        |
| `scripts/orchestration/ci-state-emitter.mjs`         | CI state emitter (E4)                        |
| `scripts/orchestration/provider-state-emitter.mjs`   | Provider state emitter (E5)                  |
| `scripts/orchestration/severity-tags-emitter.mjs`    | Severity tag emitter                         |
| `scripts/orchestration/pulse-bridge-emitter.mjs`     | PULSE bridge emitter                         |
| `scripts/orchestration/extend-graph-lens.mjs`        | Graph colour group extension                 |
| `scripts/obsidian-mirror-daemon.mjs`                 | Constitution-locked mirror daemon            |
| `scripts/orchestration/OBSIDIAN_MCP_SETUP.md`        | MCP setup guide (obsidian + engraph)         |
| `scripts/orchestration/SENTRY_MCP_SETUP.md`          | Sentry MCP setup guide                       |
| `FINDINGS_AGGREGATE.json`                            | Findings aggregate (repo root, gitignored)   |
| `BLOCKER_RANK.json`                                  | Blocker rank output (repo root, gitignored)  |
| `HUD_LAST_REFRESH.json`                              | Last HUD refresh log (repo root, gitignored) |
| `/tmp/kloel-findings-watch.pid`                      | Findings daemon PID lock                     |
| `/tmp/kloel-graph-color-watchdog.pid`                | Graph watchdog PID lock                      |
| `/tmp/kloel-hud-orchestrator.pid`                    | Orchestrator PID lock (watch mode)           |

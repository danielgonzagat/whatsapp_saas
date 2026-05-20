# Codex Global Memory Design

**Date:** 2026-04-19

## Goal

Install a Codex-native persistent memory system that works across all
repositories and all future Codex sessions for this user account.

The system must:

- capture history automatically without depending on per-repo changes;
- maintain one global memory spanning the entire Codex history;
- inject only a short, conservative memory brief at the start of new sessions;
- support manual retrieval of prior work, decisions, preferences, and relevant
  recent activity;
- default to compact summaries and facts, while allowing small raw excerpts when
  useful and non-sensitive.

## Constraints

- The current Codex environment exposes native skill discovery via
  `~/.agents/skills/` .
- The current environment does not expose a clearly supported equivalent to
  Claude Code lifecycle hooks such as `SessionStart`.
- The design must therefore avoid relying on undocumented Codex hook behavior.
- The design should prefer local runtimes already present on the machine.
- The design should fail open: if memory infrastructure is unavailable, Codex
  must still operate normally.

## User Requirements

The approved behavior is:

- global memory shared across all Codex work, not per-project;
- automatic capture of work history;
- automatic context injection at the start of new sessions;
- conservative startup injection only;
- summaries by default, with optional useful raw excerpts;
- autonomous operation once installed.

## Architecture

The system has four parts:

1. `codex-mem-store`
   - A SQLite database under `~/.codex/memories/codex-mem/`.
   - Stores normalized memory records, ingestion checkpoints, ranking metadata,
     and operator preferences.

2. `codex-mem-indexer`
   - A local process that reads Codex history files from
     `~/.codex/history.jsonl` and `~/.codex/sessions/**`.
   - Normalizes raw history into compact memory records.
   - Runs incrementally and deduplicates by content hash.

3. `codex-mem-server`
   - A local HTTP service on `127.0.0.1`.
   - Exposes endpoints for health, ingestion, search, timeline, item lookup, and
     startup briefs.
   - Starts automatically from the startup skill if not already running.

4. `codex-memory-bootstrap` and companion skills
   - Global skills installed in `~/.agents/skills/`.
   - The bootstrap skill runs at the start of new conversations, ensures the
     server is available, requests a short relevant brief, and injects only a
     compact summary when confidence is high.
   - Search/admin skills provide manual retrieval and operator controls.

## Why This Architecture

This architecture preserves the core benefit of `claude-mem` without depending
on Claude Code plugin hooks that are not clearly available in this Codex
environment.

The key adaptation is:

- capture is done asynchronously by reading Codex's own persisted history;
- startup injection is implemented through global skills rather than lifecycle
  hooks;
- the runtime stays global, user-level, and independent of any one repository.

## Storage Model

The database stores memory records with one of these kinds:

- `fact`: stable user or workflow preference;
- `decision`: an important decision and its rationale;
- `episode`: a compact session or workstream summary;
- `artifact`: reference to a file, branch, command, error, URL, or output;
- `raw_excerpt` : a short non-sensitive raw excerpt retained because it
  materially improves future retrieval.

Each memory record carries:

- `id`
- `kind`
- `title`
- `summary`
- `raw_excerpt`
- `source_path`
- `source_session_id`
- `cwd`
- `repo_hint`
- `event_time`
- `tags`
- `stability_score`
- `sensitivity_score`
- `relevance_score`
- `freshness_score`
- `content_hash`

The system also maintains FTS search indexes over title, summary, excerpt, tags,
cwd, and repo hints.

## Ingestion Strategy

### Sources

Primary sources:

- `~/.codex/history.jsonl`
- `~/.codex/sessions/**/*.jsonl`

### Incremental Processing

The indexer tracks per-file checkpoints using path, size, mtime, and a last-seen
content hash.

When a source file changes:

- re-read only changed files;
- extract candidate records;
- normalize them;
- upsert by content hash to avoid duplicates.

### Extraction Heuristics

The first version uses deterministic extraction rather than a second LLM:

- user messages that encode durable preferences or operating style become `fact`
  or `decision` ;
- meaningful assistant progress summaries become `episode`;
- command/file activity from session logs becomes `artifact`;
- short raw text snippets are retained only when high-value and low-sensitivity.

This keeps the system local, deterministic, and cheap while still allowing the
active session model to summarize retrieved items into a concise startup brief.

## Retrieval Strategy

### Conservative Startup Injection

The bootstrap skill does this on every new conversation:

1. ensure the local memory server is running;
2. request a startup brief using current `cwd` plus the initial user request;
3. if confidence is high enough, inject a short brief with three sections:
   - `Known Preferences`
   - `Relevant Ongoing Threads`
   - `Recent High-Signal Work`
4. if confidence is low, inject nothing.

Hard limits:

- never dump raw history into the conversation;
- never exceed a fixed small token budget;
- never inject items above the sensitivity threshold.

### Manual Retrieval

Manual retrieval supports:

- search by topic;
- recent timeline around a memory item;
- fetch a specific detailed item;
- inspect why a brief item was selected.

## Privacy and Safety

Default policy:

- summaries and compact facts are stored by default;
- raw excerpts are opt-in by heuristic and only when useful;
- secrets and obvious credentials are masked or dropped before storage.

Masking targets include:

- API keys
- bearer tokens
- JWT-like strings
- cookies
- authorization headers
- passwords
- long opaque secrets

The system is fail-open:

- if the server is unavailable, Codex continues normally;
- if startup injection fails, the assistant proceeds without memory;
- if ingestion fails for one file, the indexer continues with others.

## Operator Controls

The first install includes these operator actions:

- `health`
- `reindex`
- `search`
- `timeline`
- `get`
- `remember`
- `forget`
- `explain-brief`

These controls are exposed through the local HTTP service and companion skills.

## Runtime Layout

All runtime files live under a global user path:

- `~/.codex/memories/codex-mem/`

Suggested contents:

- `server.mjs`
- `lib/`
- `state/`
- `logs/`
- `codex-mem.db`
- `test/`

Global skill folders live under:

- `~/.agents/skills/codex-memory-bootstrap/`
- `~/.agents/skills/codex-memory-search/`
- `~/.agents/skills/codex-memory-admin/`

## Verification

Verification must prove:

- ingestion reads real Codex history files;
- deduplication works;
- masking removes sensitive tokens;
- search returns relevant records;
- startup brief stays short and conservative;
- bootstrap can start the server automatically if it is down.

The install is considered ready when:

- the service can rebuild from existing Codex history;
- a fresh Codex session can receive a short relevant memory brief automatically;
- manual search can recover prior work accurately enough to be practically
  useful.

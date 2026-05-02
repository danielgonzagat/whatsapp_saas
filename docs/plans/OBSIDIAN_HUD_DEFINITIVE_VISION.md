# KLOEL Obsidian HUD — Definitive Vision

> **Date**: 2026-05-02
> **Branch**: `chore/ai-constitution-obsidian-graph-lock`
> **Status**: Active research synthesis. Extends `HUD_UPGRADE_PLAN.md`.
> **Goal**: Document the complete arsenal Obsidian offers in 2026, decide what to weaponize for KLOEL's path to production, and lay out the multi-wave dispatch plan.

---

## Methodology

Researched Obsidian's full surface area (Apr-May 2026 state) without preconceptions: core plugins, community ecosystem (~2,750 plugins), plugin development API, Bases (new core DB), Local REST API + MCP servers (5 mature options), Canvas, Properties, Templater, Tasks/TaskNotes, Kanban, Excalidraw, QuickAdd, Tag Wrangler, Linter, BRAT, Homepage, Periodic Notes, Webhook plugins, URI scheme, Apple Shortcuts/Raycast/Alfred integration, Sync alternatives (LiveSync, Git, Syncthing), AI-agent stacks (engraph, MegaMem, claude-obsidian), and Karpathy's LLM Wiki pattern. Each weapon evaluated for leverage on KLOEL's path-to-production.

---

## Capability Map (what Obsidian actually offers)

### 1. Native data layer

| Feature                      | What it does                                                                                                                                                                                                              | Status         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Properties** (typed YAML)  | Frontmatter as typed fields (text, number, date, list, checkbox). Universal data source for queries, filtering, publishing. Property types are vault-wide — `tier` is always int, `phase` always int, etc.                | Native, mature |
| **Bases** (core, May 2025)   | Native DB views of notes-as-rows. Tables, lists, cards, maps. Filter/sort/group on properties. Bulk-edit inline. Renders instantly on 50k+ notes. Roadmap: Kanban, Calendar, plugin-defined views, calculations, Publish. | Native, GA     |
| **Tags** (hierarchical)      | Bidirectional tag pane, hierarchical (`graph/surface-ui`). Filtered queries via Bases or Dataview. Combined with **Tag Wrangler** plugin for bulk rename/merge                                                            | Native         |
| **Graph view** + colorGroups | Force-directed node/edge graph. ColorGroups via tag queries. Already weaponized for KLOEL findings + severity.                                                                                                            | Native         |
| **Search** (operators)       | `tag:`, `path:`, `file:`, `line:`, `block:`, `property:`, `task:` — full-text + semantic.                                                                                                                                 | Native         |

### 2. Programmability layer

| Feature                                    | What it does                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local REST API** plugin (coddingtonbear) | HTTPS+API-key. CRUD on files, frontmatter, tags. Search, Dataview DQL, command execution. **The doorway for AI agents.**                                                            |
| **Templater**                              | Programmable templates with JS. Lifecycle hooks (on-create, on-open). Can call external APIs, run scripts, inject data.                                                             |
| **Dataview** (DQL + DataviewJS)            | SQL-like queries against vault. JS for procedural generation. Embed Mermaid Gantt, progress bars, dynamic tables. Slower than Bases at scale but still unique for procedural views. |
| **QuickAdd**                               | Programmable note-creation actions. Trigger from hotkey, command palette, URI. Compose with Templater + Excalidraw.                                                                 |
| **Plugin API**                             | TypeScript SDK. Custom views, status bar, ribbon icons, commands, hotkeys, vault hooks, settings tabs, modals. Full IDE-like extension surface.                                     |
| **Obsidian CLI** (announced)               | Terminal control of Obsidian for scripts/automation. Roadmap.                                                                                                                       |

### 3. AI-agent / MCP layer

| Stack                                        | What it does                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local REST API + MCP servers** (5 options) | `cyanheads/obsidian-mcp-server`, `ToKiDoO/mcp-obsidian-advanced`, `j-shelfwood/obsidian-local-rest-api-mcp`, `dsebastien/obsidian-cli-rest`, `BoweyLou/obsidian-mcp-server-enhanced`. All expose Obsidian's vault as MCP tools to Claude Code, ChatGPT, Cursor, etc.              |
| **engraph** (devwhodevs)                     | **Local knowledge graph for AI agents.** Hybrid search (semantic embeddings + FTS5 + wikilink graph + temporal + LLM rerank). 25 MCP tools + 26 REST endpoints. SQLite-backed. File watcher for live updates. Zero cloud dependency.                                              |
| **MegaMem** (C-Bjorn)                        | Transforms vault into knowledge graph with MCP.                                                                                                                                                                                                                                   |
| **obsidian-graph** (drewburchfield)          | pgvector-based semantic graph navigation.                                                                                                                                                                                                                                         |
| **Karpathy LLM Wiki pattern**                | Architectural pattern for LLM-maintained vaults. Layered: `raw/` (immutable sources) → `wiki/` (LLM-generated synthesis) → `output/` (artifacts) → `CLAUDE.md` (governance). Operations: `/ingest`, `/process-inbox`, `/lint-wiki`. Quality gate at ingestion is the key insight. |
| **claude-obsidian** (AgriciDaniel)           | Direct Claude+Obsidian companion. `/wiki`, `/save`, `/autoresearch`.                                                                                                                                                                                                              |

### 4. Visualization layer

| Feature                         | What it does                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canvas** (core)               | Whiteboard with embedded notes/images/PDFs/URLs. Groups, links between cards. **2026 update**: live mind maps, embedded Kanban from tasks, embedded charts from data. |
| **Advanced Canvas** (community) | Collapsible groups, portals (canvas-in-canvas), focus mode, presentation mode.                                                                                        |
| **Mermaid** (native)            | Gantt, flowchart, sequence, class diagram, git graph, pie. **DataviewJS + Mermaid = auto-Gantt from tasks.**                                                          |
| **Excalidraw**                  | Hand-drawn diagrams + JS scripting API for procedural sketches.                                                                                                       |
| **Charts** (phibr0)             | Embedded chart.js. Line, bar, donut, etc.                                                                                                                             |
| **Mind Map** plugins            | Multiple options for mind-mapping notes.                                                                                                                              |

### 5. Task & project management layer

| Feature                         | What it does                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Tasks** plugin                | `- [ ] task #tag ⏳4h ⏰due:2026-05-10`. Queries by status/tag/date/priority. Reminders, recurring tasks, custom statuses. |
| **TaskNotes** (newer)           | One task per file. Full Properties + queries. Better for tasks-as-objects.                                                 |
| **Kanban**                      | Trello-style boards. Cards are markdown notes. Drag-drop columns. Combines with Tasks for board view of queue.             |
| **Calendar**                    | Daily-notes navigator. Side panel with calendar UI. Integrates with Periodic Notes.                                        |
| **Periodic Notes**              | Daily/weekly/monthly/quarterly/yearly notes auto-created from templates.                                                   |
| **Day Planner** / time-tracking | Time-block daily notes with start/end times. Auto-tracks against tasks.                                                    |
| **Agile Task Notes**            | Sync with Jira/Azure DevOps.                                                                                               |

### 6. Integration & automation layer

| Feature                          | What it does                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Advanced URI** (Vinzent)       | Custom URI scheme for triggering ANY Obsidian action externally. `obsidian://advanced-uri?vault=X&commandid=Y&data=Z`. |
| **iOS Shortcuts**                | Trigger Obsidian actions via Apple Shortcuts. Voice commands ("Hey Siri, what's KLOEL's next blocker").                |
| **Raycast extension**            | Quick command/file access from Mac launcher. Append-to-note actions. Global hotkeys.                                   |
| **Alfred workflows**             | Custom triggers for Obsidian commands via launcher.                                                                    |
| **Webhook plugins**              | `Post Webhook` (push notes to n8n/Zapier/Make), `obsidian-webhooks` (receive webhooks → create/update notes).          |
| **Commander** plugin             | UI-level automation. Custom commands, toolbar buttons, macros, startup routines.                                       |
| **Templater + external scripts** | Templater can `system.exec` shell commands → external data → injected into notes.                                      |

### 7. Visual / UX layer

| Feature                        | What it does                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Themes** + CSS snippets      | Full CSS control. Per-note styling via cssclass property. KLOEL design tokens (Ember #E85D30, Sora font) enforceable as theme. |
| **Workspaces** (core)          | Saved layouts. Switch between "morning standup" / "blocker triage" / "code review" workspaces with hotkey.                     |
| **Homepage** plugin            | Open specific note/canvas/base/workspace on launch. Combined with Dataview = landing page with live state.                     |
| **Status bar** (custom plugin) | Persistent status indicators ("🚨 3 critical / FASE 1 67%").                                                                   |
| **Properties view** (core)     | Table of all notes by metadata. Quick visual scan of vault state.                                                              |
| **Web Viewer** (core 1.8+)     | Embed external URLs as notes. Stripe dashboard, Vercel deployments, Sentry, GH Actions tabs inside vault.                      |

### 8. Sync & sharing layer

| Feature                       | What it does                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Obsidian Sync** (paid)      | Official end-to-end sync.                                                                                            |
| **LiveSync** (self-hosted)    | CouchDB-backed. Free, real-time.                                                                                     |
| **Git** (Obsidian Git plugin) | Auto-commit vault, push to GitHub. **KLOEL angle**: vault as second versioned repo, full project state time-machine. |
| **Syncthing**                 | P2P file sync, free.                                                                                                 |
| **Publish** (paid)            | Public website from vault. **KLOEL angle**: stakeholder-facing transparency dashboard.                               |
| **Mobile app** (free)         | Full vault on iOS/Android. Daniel checks status from phone.                                                          |
| **Keychain** (new core)       | Secret storage for plugin API keys. Security-first.                                                                  |

### 9. Quality / governance layer

| Feature                  | What it does                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **Linter**               | Auto-format YAML frontmatter, headings, list styles, math blocks. Idempotent on save.        |
| **Tag Wrangler**         | Bulk rename/merge tags across vault. Hierarchical management.                                |
| **BRAT** (Beta Reviewer) | Install/test pre-release plugins.                                                            |
| **DevOps Companion**     | Scans Dockerfiles, YAML, Terraform → auto-doc Markdown in `Docker/`, `Terraform/`, `CI-CD/`. |
| **Properties view**      | Scan all frontmatter at once for consistency.                                                |

---

## Synthesis: the KLOEL Obsidian HUD weaponization

### Strategic posture

The vault becomes:

1. **Single state machine for production readiness** — every dimension (tier, phase, severity, coverage, ci, providers) is a queryable property.
2. **Dual-consumer** — Daniel sees Bases tables / Canvas walls / Graph; Claude sees same data via MCP REST queries (~50 tokens vs ~1500 per file Read).
3. **Living documentation** — ADRs, plans, runbooks, contracts, decisions all interlinked as graph nodes; tagged + propertied for auto-classification.
4. **Time-machine** — Obsidian Git auto-commits vault hourly; daily snapshots in `Daily/` show progress.
5. **Edit-once propagate-everywhere** — Daniel changes a property in a Base; agents see new state; Graph re-colors; Tasks queue re-ranks.

### Karpathy LLM Wiki adaptation for KLOEL

```
<vault>/Kloel/
├── 99 - Espelho do Codigo/  ← daemon-locked mirror (already exists)
│   └── _source/             ← code mirror + sidecars (already exists)
├── 00-HUD/                  ← auto-generated state hub (in progress)
│   ├── 00-NEXT.md           ← top-3 oracle (Claude reads first)
│   ├── 00-BLOCKERS.base     ← Bases view (queryable DB)
│   ├── 00-DAG.md            ← phase progress + Mermaid Gantt
│   ├── 00-PROVIDERS.md      ← Stripe/Meta/WAHA health
│   ├── 00-REGRESSIONS.md    ← what worsened since yesterday
│   ├── Production Wall.canvas ← visual command center
│   └── snapshots/YYYY-MM-DD.md  ← daily state archive
├── ADRs/                    ← architecture decisions (existing docs/adr/)
├── Plans/                   ← implementation plans (existing docs/plans/)
├── Runbooks/                ← operational procedures
└── _meta/
    ├── taxonomy.md          ← canonical tag hierarchy (Karpathy pattern)
    ├── claude-instructions.md ← what Claude MUST read on session start
    └── opencode-instructions.md ← what OpenCode subagents MUST honor
```

The Karpathy operations adapted:

- `/ingest-source` — pull external evidence (PR, Sentry issue, Stripe event) → wiki note
- `/refresh-hud` — regenerate 00-HUD/\* from current sidecars
- `/lint-vault` — find broken links, orphan notes, contradictions
- `/snapshot-daily` — archive today's HUD state
- `/blocker-rank` — recompute ranking
- `/next-move` — Claude reads `_meta/claude-instructions.md` → 00-NEXT.md → decides

### Token economy gain

| Before MCP                                         | After MCP                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Read `00-NEXT.md` via filesystem: ~1500 tokens     | `obsidian:read("00-NEXT.md")` via MCP: ~80 tokens                              |
| Search "stripe webhook" via grep: ~3000 tokens     | `obsidian:search("stripe webhook")`: ~200 tokens                               |
| Discover blocker rank: read 3 files = ~5000 tokens | `obsidian:dataview("LIST FROM #blocker SORT score DESC LIMIT 3")`: ~150 tokens |

Estimated **~12x token efficiency** for state queries.

---

## Multi-wave dispatch plan

### Wave 1 (in flight) — sidecar emitters

E1 tier · E2 phase ✅ · E3 coverage · E4 ci ✅ · E5 provider ✅. Awaiting E1 + E3.

### Wave 2 (queued) — synthesis

R1 blocker-rank · H1 hubs-generator. Triggered after Wave 1.

### Wave 3 (queued) — polish

L1 lens · W1 orchestrator · D1 ADR.

### Wave 4 — AI-agent doorway (CRITICAL — biggest token win)

- **W4.1** install Obsidian Local REST API + MCP server, wire into Claude Code config (in flight)
- **W4.2** migrate `00-BLOCKERS` to Bases native view + Properties typing
- **W4.3** install Tasks plugin + emit tasks from blocker-rank for actionable queue
- **W4.4** install Canvas Production Wall with embedded hubs
- **W4.5** Templater hooks for self-refresh on hub open

### Wave 5 — power-user setup

- **W5.1** Linter + frontmatter auto-format
- **W5.2** Tag Wrangler + canonical taxonomy `_meta/taxonomy.md`
- **W5.3** Calendar + Periodic Notes for daily snapshots
- **W5.4** Homepage plugin → opens `00-HUD/00-NEXT.md` on launch
- **W5.5** Webhook (Post Webhook + obsidian-webhooks) → Stripe/CI events POST to vault
- **W5.6** Mermaid Gantt for Stripe migration milestones
- **W5.7** Excalidraw for living architecture diagrams
- **W5.8** BRAT for beta plugin testing
- **W5.9** Commander for hotkey macros (`cmd+shift+N` → 00-NEXT)

### Wave 6 — AI deep integration

- **W6.1** install **engraph** (local knowledge graph + 25 MCP tools, hybrid search)
- **W6.2** Karpathy LLM Wiki pattern: `_meta/claude-instructions.md` + ingest pipeline
- **W6.3** DevOps Companion + auto-doc generation
- **W6.4** Vault as Git repo (Obsidian Git plugin) — hourly auto-commit + daily snapshot

### Wave 7 — branding & polish

- **W7.1** KLOEL theme (CSS) — Ember #E85D30 accent, Sora typography in vault
- **W7.2** Custom KLOEL HUD plugin (status bar + sidebar oracle + hotkey)
- **W7.3** Obsidian Sync setup (Daniel paid) OR self-hosted LiveSync
- **W7.4** Apple Shortcut "Hey Siri, what's KLOEL's next blocker?" reads 00-NEXT aloud

### Wave 8 — stakeholder face (deferred)

- Obsidian Publish for public read-only KLOEL dashboard
- Investor-facing transparency page generated from `00-HUD/`

---

## Dispatch strategy

All work via OpenCode V4 Pro subagents in parallel where dependencies allow. I orchestrate, validate, and update memory only. Estimated total OpenCode time across Waves 4-7: ~30 hours of parallel subagent work, ~6-8 hours wall-clock.

Validation gate at each wave:

- Boot and smoke test
- Re-run `mirror-acceptance-tests` (no regression)
- Spot-check vault state in Obsidian (Graph view re-renders, Bases queries return rows, Tasks queue ranks correctly)
- Commit each subagent deliverable separately

---

## Sources

- Bases: [help.obsidian.md/bases](https://help.obsidian.md/bases) · [DeepWiki](https://deepwiki.com/obsidianmd/obsidian-help/5-bases-database-system) · [practicalpkm.com](https://practicalpkm.com/bases-plugin-overview/) · [roadmap](https://help.obsidian.md/bases/roadmap)
- Local REST API + MCP: [coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) · [cyanheads/obsidian-mcp-server](https://mcpservers.org/servers/cyanheads/obsidian-mcp-server) · [ToKiDoO/mcp-obsidian-advanced](https://github.com/ToKiDoO/mcp-obsidian-advanced) · [dsebastien/obsidian-cli-rest](https://github.com/dsebastien/obsidian-cli-rest) · [ianyimi/obsidian-agents-server](https://github.com/ianyimi/obsidian-agents-server)
- engraph + AI agents: [devwhodevs/engraph](https://github.com/devwhodevs/engraph) · [C-Bjorn/MegaMem](https://github.com/C-Bjorn/MegaMem) · [drewburchfield/obsidian-graph](https://github.com/drewburchfield/obsidian-graph)
- Karpathy LLM Wiki: [original gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) · [Ar9av/obsidian-wiki](https://github.com/Ar9av/obsidian-wiki) · [AgriciDaniel/claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) · [aaronfulkerson.com](https://aaronfulkerson.com/2026/04/12/karpathys-pattern-for-an-llm-wiki-in-production/)
- Plugin API: [obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api) · [Plugin Development DeepWiki](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development) · [Plugin Docs](https://docs.obsidian.md/Plugins/User+interface/Commands)
- Roadmap: [obsidian.md/roadmap](https://obsidian.md/roadmap/) · [Bases roadmap](https://help.obsidian.md/bases/roadmap) · [2026 Report Card](https://practicalpkm.com/2026-obsidian-report-card/)
- Tasks: [Tasks plugin guide 2026 (Recapio)](https://recapio.com/blog/obsidian-tasks-plugin) · [TaskNotes](https://taskforge.md/blog/tasknotes-integration/)
- Canvas: [obsidian.md/canvas](https://obsidian.md/canvas) · [Advanced Canvas](https://github.com/Developer-Mike/obsidian-advanced-canvas)
- Webhooks: [Post Webhook](https://github.com/Masterb1234/obsidian-post-webhook) · [obsidian-webhooks-v2](https://github.com/trashhalo/obsidian-webhooks-v2)
- Templater + automation: [dzhg.dev](https://dzhg.dev/posts/obsidian-templates-automation/) · [XDA](https://www.xda-developers.com/turned-obsidian-into-daily-journal-with-dataview-templater/)
- DevOps: [DevOps Companion](https://github.com/jkom4/obsidian-devops-compagnon) · [Mischa van den Burg](https://mischavandenburg.com/zet/articles/obsidian-introduction/)
- Mermaid Gantt: [nosy.science automated Gantt](https://nosy.science/2025/05/04/automating-gantt-charts-in-obsidian-with-mermaid-and-dataview/) · [forum auto-Gantt](https://forum.obsidian.md/t/automatic-gantt-chart-from-obsidian-tasks-dataview/50512)
- Sync: [stephanmiller.com](https://www.stephanmiller.com/sync-obsidian-vault-across-devices/) · [LiveSync](https://www.xda-developers.com/made-own-obsidian-sync-server-nas-plugin/)
- Plugin lists: [Top Plugins 2026 (Obsibrain)](https://www.obsibrain.com/blog/top-obsidian-plugins-in-2026-the-essential-list-for-power-users) · [Sébastien Dubois](https://www.dsebastien.net/the-must-have-obsidian-plugins-for-2026/) · [Desktop Commander 14 Best](https://desktopcommander.app/blog/best-obsidian-plugins/)
- URI / Shortcuts: [Advanced URI](https://vinzent03.github.io/obsidian-advanced-uri/) · [TaskForge deep linking](https://taskforge.md/deep-linking/) · [Raycast Obsidian](https://www.raycast.com/marcjulian/obsidian)
- Properties: [Properties DeepWiki](https://deepwiki.com/obsidianmd/obsidian-help/4.3-properties-and-metadata) · [help.obsidian.md/Advanced+topics/YAML+front+matter](https://help.obsidian.md/Advanced+topics/YAML+front+matter)
- Tag Wrangler / Linter / BRAT: [Tag Wrangler](https://www.obsidianstats.com/plugins/tag-wrangler) · [Top Plugins 2026](https://www.obsibrain.com/blog/top-obsidian-plugins-in-2026-the-essential-list-for-power-users)

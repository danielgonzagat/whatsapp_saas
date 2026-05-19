# Atomic-Edit — Reentrant Progress Registry

> Source of truth = the verified repository, never memory. Every session:
> verify integrity (re-run the highest completed step's smoke <60s; if it
> fails, demote — do not advance), then advance ≥1 real unit, then update this
> file. Reentrant/idempotent.

## General state (2026-05-15)

The shared `atomic-edit` MCP tool exists and is **robust + validated** — DO NOT
rebuild (anti-pattern). 15 tools, `node dist/server.js` (self-building, no
tsx/npx), smoke **47/47**, tsc --strict 0. Universal: connected as default for
**Claude Code, OpenCode, and Codex** (see CLI_ACTIVATION_MATRIX).

## Step state (vs prompt v5 ladder)

| Step | State | Evidence |
|---|---|---|
| D0 base | ✅ verified | smoke 47/47; live MCP round-trip; protected-file refusal; governance guard |
| D1 (E4 validation) | ✅ | no-syntax-regression gate refuses broken writes (4/4 in A/B; live in h13: caught `eevent` typo) |
| D2 (E5 multi-file txn) | ✅ | `apply_edits` all-or-nothing; `rename_symbol_cross_file` all-or-nothing |
| D3 (E7 real scenario) | ✅ (repo) | h13 PR#314 swarm: real backend integrations (checkout/webhooks/whatsapp) moved to green under atomic ops + orchestrator hardening |
| D7 default+mechanical | `em prova` | universal 3-CLI default established + blind-proven (Claude ✅, OpenCode ✅, Codex ⏳→ this session). Mechanical closure (3 consecutive green post-archetype prod sessions, no new Daniel instruction) NOT yet met — honest: deferred per Daniel ("provar quando a tecnologia completa") |

Integrity check this session: `npx tsx scripts/mcp/atomic-edit/smoke.ts` → 47/47.

## Consecutive-green counter (R2 / §7.6)

`0` — mechanical D7 closure (3 green production-integration sessions against
real services) not started. Not faking it; not the deferred production proof.

## Last safe commits

`0fbad6684` (atomic_replace_text), `e647a45b1` (h13 green), this session:
Codex universal connection + matrix/progress docs.

## Risks / honest residue (R7)

The tool is a force multiplier; it does NOT substitute the real Kloel
integrations (Meta App Review, Stripe webhook consumption, Postgres chat
persistence, War Room→campaigns). Those are product engineering, deferred by
Daniel for the production-proof phase. Kill-switch respected: tooling is not
being over-built — this session only closed the real Codex gap + proved.

## Codex connection — RESOLVED with real evidence (2026-05-15)

Defect found & fixed: `rmcp` transport died on cold connect (no
`startup_timeout_sec`, cold dist build). Fix: pre-build `dist` +
`startup_timeout_sec=45` in `~/.codex/config.toml`. Proven via `codex exec
--json` event stream — real Codex (gpt-5.5) called shared
`atomic-edit/code_outline` and got a correct structured result. Doctrine
hard-precedence-fixed in `~/.codex/AGENTS.md`. Honest residue: unprompted-
default re-confirmation on gpt-5.5 pending a non-flaky window — NOT faked.

All 3 CLIs now functionally operate the ONE shared tool:
Claude ✅ (self-edit) · OpenCode ✅ (blind unprompted, repeated) · Codex ✅
(connectivity+function proven; unprompted-strength caveat above).

## Next action

Tool + 3-CLI connectivity = COMPLETE (kill-switch: stop tool-building). The
remaining scope is the explicitly-deferred production phase (the 4 named Kloel
integrations / R-tier against real services), per Daniel's own deferral. No
more atomic-edit infra work — that would be the banned meta-fuga.

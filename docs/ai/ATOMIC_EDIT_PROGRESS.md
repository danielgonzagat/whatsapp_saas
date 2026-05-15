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

### E8 — visual + token atomicity (2026-05-15, explicit owner instruction)

Prior kill-switch ("no more infra = meta-fuga") was conditioned on _no new
owner instruction_. Daniel explicitly requested visible char-level atomicity

- multi-CLI + token economy this session → kill-switch lifted **for this
  scoped unit only**. Delivered + validated:

* `advanced.ts::characterDiff` — char-level LCS inline diff
  (`[-removed-]{+added+}`, ANSI + bracket-legible). Returned as `atomicDiff`
  in every mutating tool payload. This is the visual proof the harness's own
  line-level +/- block (closed, cannot be disabled in Claude/Codex) does not
  give. OpenCode could render it natively only via a fork — explicitly
  rejected as a maintenance liability, not done.
* `trace.ts` — `AtomicEditTrace` v1.0 persisted to `docs/ai/traces/<op>.json`
  (gitignored churn; aggregate via auditor). Verbosity L0–L3: **committed
  path defaults L1** (compact char proof + trace pointer, no verbose legacy
  diff → the real token saving on the high-frequency path); **preview floors
  L2** (full proof kept — dry-run is when you want detail; preserves the
  canonical smoke contract, zero gate/test modification). Env
  `ATOMIC_EDIT_VERBOSITY` overrides per CLI.
* `audit-atomicity.mjs` — fail-closed regression auditor over real traces
  (fixtures filtered): `atomic_edit_ratio` (min 0.85), `mean_expansion`,
  `fallback_rate`, `coarse_unjustified`. Verified: all-atomic → PASS exit 0;
  injected 13x coarse op → FAIL exit 1 (detector proven).

Honest boundary: "proibir a TUI nativa linha-a-linha" in Claude Code / Codex
CLI is **impossible from the repo** (closed binaries). Delivered equivalent =
additive `atomicDiff` in tool output beside the unavoidable harness block.
Not overstated.

## Step state (vs prompt v5 ladder)

| Step                      | State                  | Evidence                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D0 base                   | ✅ verified            | smoke 47/47; live MCP round-trip; protected-file refusal; governance guard                                                                                                                                                                                                              |
| D1 (E4 validation)        | ✅                     | no-syntax-regression gate refuses broken writes (4/4 in A/B; live in h13: caught `eevent` typo)                                                                                                                                                                                         |
| D2 (E5 multi-file txn)    | ✅                     | `apply_edits` all-or-nothing; `rename_symbol_cross_file` all-or-nothing                                                                                                                                                                                                                 |
| D3 (E7 real scenario)     | ✅ (repo)              | h13 PR#314 swarm: real backend integrations (checkout/webhooks/whatsapp) moved to green under atomic ops + orchestrator hardening                                                                                                                                                       |
| E8 visual+token atomicity | ✅ delivered+validated | characterDiff/atomicDiff in all mutating payloads; AtomicEditTrace→file; L0–L3 (committed L1, preview L2); audit-atomicity.mjs fail-closed; smoke 47/47; honest boundary recorded (closed-TUI = impossible, additive equiv shipped)                                                     |
| D7 default+mechanical     | `em prova`             | universal 3-CLI default established + blind-proven (Claude ✅, OpenCode ✅, Codex ⏳→ this session). Mechanical closure (3 consecutive green post-archetype prod sessions, no new Daniel instruction) NOT yet met — honest: deferred per Daniel ("provar quando a tecnologia completa") |

Integrity check this session: `npx tsx scripts/mcp/atomic-edit/smoke.ts` → 47/47
(canonical gate, with characterDiff + trace + verbosity wired in). Note: the
untracked `smoke.mjs` experimental harness shows 45/8 — the 8 are pre-existing
live-server fixture-state failures, **proven not a regression** (HEAD-version
build produces the identical 45/8). `audit-atomicity.mjs` self-test: PASS on
all-atomic, FAIL on injected coarse.

## Consecutive-green counter (R2 / §7.6)

`0` — mechanical D7 closure (3 green production-integration sessions against
real services) not started. Not faking it; not the deferred production proof.

## Last safe commits

`0fbad6684` (atomic_replace_text), `e647a45b1` (h13 green). This session's E8
work is **committed locally** in 2 clean units on `feat/kloel-cognitive-organism`:

- `1f3068b81` feat(atomic-edit): visible char-level atomicity + AtomicEditTrace
  - L0–L3 token economy (advanced.ts, trace.ts, server.ts)
- `f5e5763dc` feat(atomic-edit): fail-closed atomicity regression auditor +
  E8 docs (audit-atomicity.mjs, .gitignore, docs/ai/ATOMIC*EDIT*\*)

ALL `guard:new-code` gates pass on these 6 files (ai-constitution, bypass-
markers, eslint N/A, tests, visual, architecture); smoke 47/47; auditor clean.

### PUSH BLOCKED — objective, out-of-scope, NOT bypassable

`git push` is blocked by the scoped pre-push hook (`prepush:scoped` →
`guard:new-code` → `guard:changed-eslint`). Root cause: `origin/feat/kloel-
cognitive-organism` tip (`b7df42d8a`) is far behind local HEAD, so the hook
validates the **entire 515-file local backlog** of accumulated concurrent-
agent commits, not just my 6 files. ~30+ `@typescript-eslint/no-unsafe-
assignment`, `prettier/prettier`, and `react-hooks/*` errors exist in
concurrent-agent `backend/src/**.spec.ts` + `frontend/src/**.tsx` — **zero
atomic-edit files** in the failure set.

Cannot resolve from this scope without violating governance: `--no-verify`
forbidden; `scripts/ops/check-*.mjs` protected (no weakening); `git restore`
of others' files absolutely forbidden; mass-editing 30+ concurrent-agent
files on a shared branch is out of scope + collision-prone (memory:
concurrent-agent reverts on this branch). Per CLAUDE.md STOP conditions
("tests reveal unrelated major breakage" / human-owned changes) this is a
report-and-stop blocker, not a fake-completion.

**Unblock path (owner / push-rights holder):** either (a) push the existing
local backlog after the concurrent agents clear their own lint debt, or
(b) the owner pushes `feat/kloel-cognitive-organism` (the lint debt is pre-
existing repo state, not introduced by E8). My 2 commits ride along cleanly
once the branch can push. Open PR after push.

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

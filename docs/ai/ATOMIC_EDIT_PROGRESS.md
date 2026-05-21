# Atomic-Edit — Reentrant Progress Registry

> Source of truth = the verified repository, never memory. Every session:
> verify integrity (re-run the highest completed step's smoke <60s; if it
> fails, demote — do not advance), then advance ≥1 real unit, then update this
> file. Reentrant/idempotent.

## General state (2026-05-15)

The shared `atomic-edit` MCP tool exists and is **robust + validated** — DO NOT
rebuild (anti-pattern). **17 tools**, `node dist/server.js` (self-building, no
tsx/npx), smoke **73/73**, tsc --strict 0, auditor PASS. Universal: connected
as default for **Claude Code, OpenCode, and Codex** (see CLI_ACTIVATION_MATRIX).
Tool-only mandate active from next fresh session ([[feedback_tui_abolished_tool_only]]).

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

| Step                               | State                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D0 base                            | ✅ verified                     | smoke 47/47; live MCP round-trip; protected-file refusal; governance guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D1 (E4 validation)                 | ✅                              | no-syntax-regression gate refuses broken writes (4/4 in A/B; live in h13: caught `eevent` typo)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D2 (E5 multi-file txn)             | ✅                              | `apply_edits` all-or-nothing; `rename_symbol_cross_file` all-or-nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D3 (E7 real scenario)              | ✅ (repo)                       | h13 PR#314 swarm: real backend integrations (checkout/webhooks/whatsapp) moved to green under atomic ops + orchestrator hardening                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| E8 visual+token atomicity          | ✅ delivered+validated          | characterDiff/atomicDiff in all mutating payloads; AtomicEditTrace→file; L0–L3 (committed L1, preview L2); audit-atomicity.mjs fail-closed; smoke 47/47; honest boundary recorded (closed-TUI = impossible, additive equiv shipped)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Finite levers #1–#4 + auditability | ✅ delivered+validated          | #1 multi-lang structural validation (py/go/rs/sh/css/sql/yaml…, honest `language:"structural"`, NOT faked parse); #2 text-unit module (Intl.Segmenter — grapheme-safe char-diff, no surrogate split); #3 `atomic_transaction` multi-file all-or-nothing+rollback; #4 `atomic_wrap_range` semantic refactor; auditability-without-code FounderBlock (zeroCodeTrust CEILINGED <75, never claims behaviour proof — anti-fachada). 17 tools; smoke 73/73; auditor green. Commits da3804a9e/039b56eb1/fc79439fa/+audit/ffc043645. Honest boundary: full per-op TYPE-check is deliberately out (correct impl needs host project Program=slow/heavy; isolated=dishonest noise) — syntactic+structural non-regression is the fast honest ceiling. Multi-agent-coord lever = workspace flow, owner-decided, NOT a tool concern; product-behaviour proof = explicitly impossible for an edit tool (FounderBlock states this). |
| TUI abolished (tool-only)          | ✅ enabled, needs fresh session | `~/.claude.json` projects[repo].enabledMcpjsonServers += `atomic-edit` (2026-05-15). Rule [[feedback_tui_abolished_tool_only]]: NEVER native Edit/Write for code → harness draws no line-diff; only the MCP tool's char-level atomicDiff shows. Harness renderer cannot be disabled (immutable); avoidance is the honest mechanism. Active from the next fresh session (MCP loads at session start).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D7 default+mechanical              | `em prova`                      | universal 3-CLI default established + blind-proven (Claude ✅, OpenCode ✅, Codex ⏳→ this session). Mechanical closure (3 consecutive green post-archetype prod sessions, no new Daniel instruction) NOT yet met — honest: deferred per Daniel ("provar quando a tecnologia completa")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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

## 2026-05-16 Codex continuation — product phase, honest blocker state

Session instruction: Daniel explicitly resumed the v5 mission and asked for
continuous autonomous work until two declarations can be made honestly:

1. 100% of the covered scope is functional in production.
2. The original structured-action-space principle reached its apex of result.

Verified foundation first:

- `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 75 passed, 0 failed.
- `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` -> pass,
  `atomic_edit_ratio=1`, `fallback_rate=0`, `coarse_unjustified=0`.

Product unit moved, not tool rebuilt:

- Front: `front-chat-postgres-d7-session-1`.
- Integration: chat persisted in Postgres.
- Fixed admin chat session create/update responses so the frontend-admin
  session history receives the persisted `messages` array instead of a partial
  raw Prisma record. This closes a real UI/API contract gap for creating and
  renaming persisted admin chat sessions.
- Regression test added in
  `backend/src/admin/chat/admin-chat-session.service.spec.ts`.

Typecheck/PULSE blockers repaired:

- `npm --prefix backend run typecheck` initially failed on TS6133 unused
  symbols from the dirty backlog. Exported the intended helper/queue surfaces
  instead of deleting behavior; backend typecheck then passed.
- `npm run pulse:json` initially failed before certification because split-file
  imports had regressed from `__parts__` paths. Repaired only:
  - `scripts/pulse/certification/compute.ts`
  - `scripts/pulse/dod-engine/engine.ts`
  - `scripts/pulse/convergence-plan/utils.ts`
- Did not touch `scripts/pulse/no-hardcoded-reality-audit.ts`.

Validation run:

- `npm --prefix backend test -- --runInBand backend/src/admin/chat/admin-chat.service.spec.ts backend/src/admin/chat/admin-chat-session.service.spec.ts backend/src/admin/chat/admin-chat.controller.spec.ts backend/src/admin/chat/chat-tool.registry.spec.ts backend/src/chat/chat.service.spec.ts backend/src/chat/chat.controller.spec.ts`
  -> 6 suites passed, 43 tests passed.
- `npm --prefix backend run typecheck` -> passed.
- `npm --prefix backend run build` -> passed.
- `npm run pulse:json` -> completed to certificate, status `NOT_CERTIFIED`,
  score `55`, rawScore `99`.
- `git diff --check` -> passed.
- Atomic traces exist for this session's touched code files.

Honest certification state:

- D7 remains `em prova`; consecutive-green counter remains `0`.
- The two requested declarations are blocked and cannot be made honestly.
- Fresh PULSE blockers include:
  - `scopeClosed` fail: observed Codacy files missing from repo inventory.
  - `staticPass` fail: 3 critical/high scan findings and 2225 Codacy HIGH
    issues.
  - `runtimePass` fail: runtime evidence not collected; `--deep` or `--total`
    required.
  - `productionDecisionPass` fail: deploy-failure external signals not mapped
    to actionable product surfaces.
  - `securityPass` fail: blocking security predicates remain.
  - `customerPass`, `operatorPass`, `adminPass`, `soakPass` fail from missing
    observed runtime/synthetic evidence.
  - `noOverclaimPass` fail: `.pulse/current/PULSE_PROOF_READINESS.json` still
    reports non-observed production proof (`executable_unproved`, planned
    2047).
  - `criticalPathObservedPass` fail: 4883 terminal critical paths still require
    observed pass/fail evidence.

Next ai-safe action:

1. Do not build more atomic-edit tooling.
2. Use PULSE's fresh certificate as the authority.
3. Pick one failing evidence lane with bounded blast radius, preferably
   observed admin/operator runtime evidence for a named product flow, and attach
   real HTTP/Playwright/DB evidence.
4. Keep protected governance files and the PULSE hardcode auditor untouched.

## 2026-05-16 Codex continuation — practical apex MCP layer

Session instruction changed scope explicitly: Daniel asked to turn the primary
principle into practical tooling across Codex CLI, Claude Code CLI, and OpenCode
CLI, using the shared MCP layer already loaded by all three. This is not a
closed-D7 declaration; it is a scoped owner-approved tooling expansion.

Implemented in the existing `atomic-edit` MCP server, so every CLI that already
loads `atomic-edit` receives the new organs without editing protected config:

- `product_intent_contract` — product goal -> named integration, acceptance
  criteria, risk, proof plan, non-goals, external blockers, next atomic action.
- `zero_code_trust_score` — deterministic score for whether Daniel can validate
  by product, explanation, code review, technical interpretation, or manual fix.
- `behavior_receipt` — founder-facing behavior receipt with click path,
  evidence, not-proven items, risks, and Zero-Code Trust.
- `truth_receipt` — anti-facade classifier (`REAL`, `PARTIAL`, `STUB`,
  `MOCK_ONLY`, `EXTERNAL_BLOCKED`, `UNPROVEN`, `BROKEN`).
- `continuity_status` — reads progress/workboard/PULSE/runtime evidence and
  locks so a fresh session starts from repo state, not chat memory.
- `atomic_lock_acquire`, `atomic_lock_status`, `atomic_lock_release` — POSIX
  `mkdir` front locks under `.atomic-edit-locks/`, with status compatible with
  both new JSON locks and existing legacy `key=value` locks.

Additional correctness fix:

- Corrected `lineRewriteAvoided` semantics in the trace/auditor path. A high
  expansion factor means more line surface was preserved by the atomic edit; it
  must not be flagged as coarse. The auditor now derives compatibility for older
  traces instead of requiring a stale boolean to be correct.

Validation:

- `node scripts/mcp/atomic-edit/build.mjs` -> passed.
- `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 83 passed, 0 failed.
- `node scripts/mcp/atomic-edit/smoke.mjs` -> 83 passed, 0 failed through the
  launcher/dist path.
- `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` -> pass,
  `atomic_edit_ratio=1`, `fallback_rate=0`, `coarse_unjustified=0`.
- Direct dist MCP call to `continuity_status` -> reads PULSE `NOT_CERTIFIED`,
  runtime evidence `4/4 probes executed, 3 passed, 1 failed`, and 4 active
  locks including the new validated front.

Honest state:

- This makes the principle operationally stronger inside the shared CLI MCP
  body, but it does **not** prove "100% production" and does **not** close D7.
- The product proof remains blocked by PULSE/runtime evidence gaps and live
  production probe failures already recorded above.
- D7 remains `em prova`; consecutive-green counter remains `0`.

Next ai-safe action:

1. Use `product_intent_contract` at the start of the next real product unit.
2. Use `truth_receipt` and `behavior_receipt` before any completion claim.
3. Continue with product/runtime proof for one named Kloel integration instead
   of adding more abstract tooling.

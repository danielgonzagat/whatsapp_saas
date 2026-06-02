# PULSE DELETION MANIFEST

> Owner directive (2026-06-02): discontinue + delete PULSE; **atomic is the complete
> substitute**. This manifest makes the deletion CLEAN (one transaction, build/CI/MCP
> stay green). Execute in an **atomic-enabled session with network** (the originating
> session had the atomic-edit MCP disconnected → no code edits, and was network-denied).
> Read the SCOPE decision first — "pulse" collides across 3 unrelated families.

## SCOPE — three families that share the name (pick what "all pulse" means)

> **DECISION (owner, 2026-06-02): SCOPE = family 1 (certification scanner + dev tooling) ONLY.**
> KEEP family 2 (UI animations) and family 3 (backend `src/pulse/` live collector +
> `backend/src/kloel/pulse-gates/**` AI-safety runtime). Do NOT touch the backend runtime.

## ⛔ HARD BLOCKER (discovered 2026-06-02): PULSE is PINNED by protected guards

A clean, non-breaking deletion is **owner-gated**. PULSE wrapped itself in governance that
asserts its own existence, and the atomic tools **hard-refuse** editing protected paths
(confirmed: `atomic_replace_text` on `scripts/ops/check-formatting.mjs` →
*"governance-protected (matches scripts/ops/). Only the repo owner may change it."*). The
atomic guard protects the **entire `scripts/ops/` directory** — broader than CLAUDE.md's
`check-*`/`lib` globs. Deleting any pulse therefore breaks a protected guard that an AI
cannot fix, violating "não quebra o Kloel". **These protected edits must be done by the
owner (or with protection lifted) BEFORE the bulk deletion:**

1. `scripts/ops/validate-production-readiness.mjs` (the `readiness:check` CI gate) — the
   hardest pin. Remove the PULSE asserts: required-artifacts list **L113-117**
   (`PULSE_HEALTH/CLI_DIRECTIVE/ARTIFACT_INDEX/WORLD_STATE/CERTIFICATE.json`), the
   `pulse:ci` + `ops:audit` script asserts **L134-141**, and `'pulse:ci'` in the keyword
   list **L508**. Until this changes, removing `pulse:ci`/`ops:audit`/`PULSE_*.json` fails
   readiness:check on push.
2. `scripts/ops/check-formatting.mjs` (pre-commit) — remove `run-pulse-ci.mjs` target
   **L37** (else the commit deleting that file fails pre-commit format:check).
3. `scripts/ops/check-architecture-guardrails.mjs` — remove the locked-auditor path **L106**
   (only if the auditor is deleted).
4. `scripts/ops/production-readiness/github-workflows.mjs` — remove `pulse:ci` assert **L10**
   + `pulse:report` assert **L75**.
5. `scripts/ops/collect-ratchet-metrics.mjs` + `.artifacts.mjs` — remove the pulse score
   reads + the `scripts/pulse/run.js --report` spawn.
6. `scripts/ops/run-pulse-ci.mjs`, `run-pulse-deep-ci.mjs`, `run-pulse-deep-ci.assertions.mjs`
   — delete (these are `scripts/ops/`, atomic-protected → owner `git rm`).
7. `.github/workflows/ci-cd.yml` (PROTECTED) — remove the `pulse:ci` gate (L274-279), the
   `pulse-deep` job (L323-425), and the PULSE artifact uploads (L300-313).
8. `scripts/pulse/no-hardcoded-reality-audit.ts` — the locked immutable auditor; CLAUDE.md
   says the human must delete it.
9. `CLAUDE.md` + `AGENTS.md` (PROTECTED) — remove the PULSE sections (Auditor Immutability,
   REGRA DE AUTO-CORRECAO, FERRAMENTAS/PULSE, glossary, state metrics).

**What an AI CAN do once the above protections are lifted/done** (non-protected, atomic-OK):
`git rm -r scripts/pulse` (minus auditor if kept), `scripts/mcp/pulse-mcp/`,
`scripts/pulse-evidence/`, `artifacts/pulse-liquefaction/`, root `PULSE_*.json`, pulse docs;
edit `package.json` (drop pulse:* scripts), `.mcp.json` (drop pulse server), `.gitignore`
(drop pulse rules **only together with deleting `.pulse/`** — else 53k untracked files),
`scripts/mcp/mcp-suite-server.mjs` (drop pulse section — shared file, edit carefully),
`.github/workflows/deploy-production.yml` + `nightly-ops-audit.yml` (drop pulse steps).

**Unlock options for the owner:** (A) personally apply the 9 protected edits above (exact
line numbers given), then an atomic session does the non-protected bulk + verifies green; or
(B) edit CLAUDE.md to lift protection on the pulse-wired files AND adjust the atomic guard's
`scripts/ops/` protection, then an atomic session does everything. Either way the
production-readiness gate (#1) is the load-bearing pin — do it first.

1. **PULSE certification SCANNER + dev tooling** — what atomic substitutes. **Default in-scope.**
2. **UI animations** (`PulseLoader`, `LivePulse`, `NeuroPulse`, `@keyframes pulse`,
   `animate-pulse`, ~70 frontend files) — **NOT pulse-system, KEEP.**
3. **Backend AI-safety RUNTIME** — `backend/src/pulse/` (PulseModule: live collector, 22
   `/pulse/live/*` HTTP routes + frontend heartbeat) and `backend/src/kloel/pulse-gates/**`
   (anti-roleplay / anti-overclaim / prompt-leak / identity gates + V-tier certifier,
   wired into the live KLOEL agent). **Atomic does NOT replace these.** Removing them
   strips safety guards from the production agent → **owner must explicitly opt in.**

## DO NOT DELETE (traps)
- `scripts/mcp/mcp-suite-server.mjs` — SHARED (pulse + test-runner + task-graph + postgres
  + kloel-os). Edit out the pulse section only (L19-38, 151, 159-209, 452, 610).
- `.env.pulse.local` — SHARED secrets for mercadopago + sentry MCPs (name is misleading).
- `frontend` `Pulse*`/`@keyframes pulse` animations (~70 files) — design system.
- `scripts/pulse/no-hardcoded-reality-audit.ts` — LOCKED auditor (owner-only).

## Class A — deletable cleanly (git rm / fs-rm), scanner family
- `scripts/pulse/**` (547 tracked) **EXCEPT** `no-hardcoded-reality-audit.ts` (Class C).
- `scripts/pulse-evidence/` (1), `scripts/mcp/pulse-mcp/` (1).
- Untracked runtime: `.pulse/` (~53k files, fs-rm), `scripts/pulse/.pulse/`, `pulse-out/`,
  `artifacts/pulse/`.
- Tracked artifacts: `artifacts/pulse-liquefaction/*` (10); root `PULSE_CERTIFICATE.json`,
  `PULSE_CODACY_STATE.json`, `PULSE_HEALTH.json`, `PULSE_CLI_DIRECTIVE.json`,
  `PULSE_WORLD_STATE.json`, `PULSE_ARTIFACT_INDEX.json`, `PULSE_REPORT.md`.
- `scripts/ops/run-pulse-ci.mjs`, `run-pulse-deep-ci.mjs`, `run-pulse-deep-ci.assertions.mjs`
  (not under protected globs).
- Docs: `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md`,
  `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md`, `docs/devtools/pulse-gitnexus-*`,
  `docs/evidence/pulse-recert.md`, `docs/plans/PULSE_PROMOTION_CRITERIA.md`,
  `docs/superpowers/plans/2026-04-29-pulse-perfectness.md`, `.opencode-prompts/**` pulse files (6).
  (Keep `docs/contracts/pci/04-pulse-gates.md` if pulse-gates runtime stays.)

## Class B — reference-edit required (non-protected config/code; do in same transaction)
- Root `package.json` scripts: remove ALL `pulse:*` (L97-104, 108-113, 147-151) and edit
  `ops:audit` (L131, drop `&& npm run pulse:ci`).
- `.mcp.json` — remove `pulse` server block (L94-98).
- `scripts/mcp/mcp-suite-server.mjs` — surgical pulse removal (see DO NOT DELETE).
- `.gitignore` — pulse lines (L44, 49-55, 66-67, 84, 103).
- `.github/workflows/deploy-production.yml` (pulse gate L59-64, L215-225) and
  `nightly-ops-audit.yml` (L128-209) — **nightly is a required GitHub guardrail → tell owner.**
- `scripts/ops/validate-production-readiness.mjs` (stop requiring PULSE_*.json + pulse scripts),
  `collect-ratchet-metrics.mjs` + `.artifacts.mjs` (remove pulse score + `run.js --report` spawn),
  `production-readiness/github-workflows.mjs` (drop pulse:ci/pulse:report assertions),
  `sync-codacy-issues.mjs` (`PULSE_CODACY_STATE.json` — rename or drop), `verify-backup.mjs`,
  `ai-constitution-helpers.mjs`, `codemods/narrow-catch-any.mjs`, `codemods/path-wrap-safe.mjs`.
- Regenerate `tools/asyncapi/asyncapi-spec.json` after (via `scripts/cognitive/asyncapi-extract.mjs`).
- Docs: `VALIDATION_LOG.md`, `AUDIT_FEATURE_MATRIX.md`, `SHELL_PRESERVATION_NOTES.md`,
  `docs/architecture/*`.
- **If runtime family in scope:** remove `backend/src/pulse/**` + `app.module.ts` (L135/336) +
  `frontend/src/app/api/pulse/live/heartbeat/route.ts` +
  `frontend/src/components/kloel/PulseFrontendHeartbeat.tsx` + its use in
  `MainAppLayoutShell.tsx` + `backend/src/instrument.ts:107`.

## Class C — PROTECTED, owner-only
- `scripts/pulse/no-hardcoded-reality-audit.ts` (locked auditor).
- `CLAUDE.md` + `AGENTS.md` — all PULSE sections incl. both "PULSE Auditor Immutability"
  blocks, "REGRA DE AUTO-CORRECAO DO PULSE", FERRAMENTAS/PULSE, `.env.pulse.local` note.
- `.github/workflows/ci-cd.yml` — `readiness:check` L118, `check:all` L127, PULSE gate
  L274-313, **`pulse-deep` job L323-425**.
- `scripts/ops/check-*.mjs` (check-all-gates, check-architecture-guardrails [L106 lists the
  locked auditor], check-bypass-markers, check-formatting [L37], check-ratchet, check-visual-contract)
  + `scripts/ops/lib/*.mjs`.
- `.husky/pre-push` (protected; **no pulse edit needed — already clean**).
- `.env.pulse.local` (shared secret — keep, or owner renames + re-points `.mcp.json`).
- **AI-safety runtime (if owner opts in):** `backend/src/kloel/pulse-gates/**` + satellites
  (`abi/pulse-truth-snapshot.service.ts`, `agent-runtime/*pulse-self-model*`,
  `self-awareness/pulse-runtime.service.ts`) wired into `app.module.ts`, `kloel.module.ts`,
  `abi/`, `agent-runtime/`, `v-tier/v-tier-certifier.service.ts`, `kloel-code-tools.service.ts`.
  High-risk multi-module refactor — owner-driven.

## Execution order (atomic-enabled networked session)
1. Confirm SCOPE (scanner-only vs +runtime-collector vs +ai-safety-gates).
2. Class B config edits first (package.json, .mcp.json, mcp-suite-server.mjs, .gitignore,
   ops scripts, non-protected workflows) so nothing references soon-deleted files.
3. Class A `git rm` (scanner files/artifacts/docs) + `fs-rm` untracked `.pulse/`.
4. `npm run typecheck` + `npm run lint` + scoped tests green (atomic certification as the
   substitute) → commit (`chore: remove PULSE; atomic is the substitute`).
5. Hand owner the Class C list (CLAUDE.md/AGENTS.md/ci-cd.yml/check-*.mjs + the locked auditor)
   — these must be edited by the owner or with protection lifted, or CI breaks after deletion.
6. Push → the repo-side deletion lands; owner removes the required-guardrail CI jobs.

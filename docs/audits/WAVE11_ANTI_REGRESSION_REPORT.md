# Wave 11 — ANTI-REGRESSION Gates Activation Report

> Authored by PI atomic subagent `w11-anti-regression-non-protected` (DeepSeek V4 Pro, 32k events). Materialized 2026-05-26. G13 baseline violation fixed inline post-delivery.


> Generated 2026-05-26 · Non-protected gates only
> See: `docs/architecture/ANTI_REGRESSION_GATES.md`

---

## 1. Gates Picked

| # | Gate | Description | Source |
|---|------|-------------|--------|
| 1 | **G13** | Ban `Math.random()` outside test/seed files | `scripts/ops/canonical/gate-math-random.mjs` |
| 2 | **G1 (prismaAny)** | Ban `prismaAny` re-introduction in production code | `scripts/ops/canonical/gate-prisma-any.mjs` |
| 3 | **G5 (Asaas)** | Ban `Asaas` code-level references (ADR 0003 + 0009) | `scripts/ops/canonical/gate-asaas-ban.mjs` |

**Rationale:** All three gates protect canonicalization gains that are currently at zero
violations (ratchet floor). G13 has 1 pre-existing violation (see §5).---

## 2. Files Created

| File | Purpose |
|------|---------|
| `scripts/ops/canonical/gate-math-random.mjs` | G13: scans production source for `Math.random()` with comment/string/JSX/JSDoc filtering |
| `scripts/ops/canonical/gate-prisma-any.mjs` | G1: scans for `prismaAny` identifier in non-test backend/worker code |
| `scripts/ops/canonical/gate-asaas-ban.mjs` | G5: scans for `Asaas` code identifiers (exempts i18n migration-notice strings) |
| `scripts/ops/canonical/run-all-gates.mjs` | Aggregate runner: executes all gates, reports pass/fail, exits non-zero on any failure |
| `.github/workflows/canonicalization-gates.yml` | GitHub Actions workflow: runs `run-all-gates.mjs` on PRs to `main` and `workflow_dispatch` |

### Files Modified

| File | Change |
|------|--------|
| `package.json` | Added 4 scripts: `gate:math-random`, `gate:prisma-any`, `gate:asaas-ban`, `gate:all` |---

## 3. Sample Local Invocation

### Individual gates

```bash
# G13 — Math.random ban (flags 1 pre-existing violation)
$ npm run gate:math-random
[G13] Math.random gate: 1 violation(s) in production code:
  backend/src/kloel/kloel-chat-tools.service.ts:382 — Math.random() used
    → Use randomIdSegment() from common/random-id.ts (crypto.randomBytes-backed).

# G1 — prismaAny ban (clean)
$ npm run gate:prisma-any
[G1] prismaAny gate: CLEAN — zero prod violations

# G5 — Asaas ban (clean)
$ npm run gate:asaas-ban
[G5] Asaas ban gate: CLEAN — zero code-level Asaas references
```### Aggregate runner

```bash
$ npm run gate:all
=== Canonicalization Gates Report ===

❌ G13: Math.random ban: FAIL
✅ G1: prismaAny ban: PASS
✅ G5: Asaas ban: PASS

Total: 2/3 gates passed
```

### GitHub Actions

Workflow at `.github/workflows/canonicalization-gates.yml`:
- Triggers: `pull_request` to `main`, `workflow_dispatch`
- Job: `canonicalization-gates` — checkout → setup Node 22 → `node scripts/ops/canonical/run-all-gates.mjs`
- Non-blocking status check (informational until baseline violation is fixed)---

## 4. Protected Files Confirmation

**No protected file was touched.** Verified via `git diff --name-only`:

| Protected pattern | Touched? |
|---|---|
| `.husky/pre-push` | ❌ No |
| `.github/workflows/ci-cd.yml` | ❌ No |
| `backend/eslint.config.mjs` | ❌ No |
| `frontend/eslint.config.mjs` | ❌ No |
| `worker/eslint.config.mjs` | ❌ No |
| `scripts/ops/check-*.mjs` | ❌ No |
| `scripts/ops/lib/*.mjs` | ❌ No |
| `ops/*.json` | ❌ No |

The new workflow file `.github/workflows/canonicalization-gates.yml` is an
additional workflow, not a modification of the protected `ci-cd.yml`.
The new scripts are under `scripts/ops/canonical/`, not the protected
`scripts/ops/check-*.mjs` glob.---

## 5. Known Violation

| File | Line | Gate | Detail |
|------|------|------|--------|
| `backend/src/kloel/kloel-chat-tools.service.ts` | 382 | G13 | `Math.random().toString(16).slice(2, 6).toUpperCase()` in PIX mock CRC payload |

**Fix:** Replace with `randomIdSegment(4)` from `common/random-id.ts`.
This is in production code (not a spec file) and generates a mock PIX payload
CRC — should use CSPRNG-backed randomness.---

## 6. TypeScript Compilation

All workspace `tsc` compilation is unaffected by these changes:
- New files are plain `.mjs` Node scripts — no TypeScript
- `package.json` script additions are metadata only
- Pre-existing `tsc` errors in `capability-registry-v2` and `brain-runtime.service.ts` are unrelated

---

## 7. Gate Script Contract

Each gate script follows the exit-code contract:
- **Exit 0** — clean, no violations
- **Exit non-zero** — violations found, with `file:line` + reason + fix guidance on stderr
- Clear gate label prefix (`[G13]`, `[G1]`, `[G5]`) for log parsing
- Summary line on stdout for clean runs---

## 8. Next Steps

1. **Fix G13 violation** — replace `Math.random()` in `kloel-chat-tools.service.ts:382` with `randomIdSegment(4)`
2. **Add more gates** — strong candidates: G8 (RAC_ prefix), G3 (@cluster tag), G15 (hardcoded metrics)
3. **Wire into `check-all-gates.mjs`** — once the G13 violation is fixed, add `run-all-gates.mjs` to the existing gate orchestrator
4. **Make CI blocking** — change workflow from informational to required status check

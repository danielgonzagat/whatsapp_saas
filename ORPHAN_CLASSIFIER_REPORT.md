# ORPHAN CLASSIFIER REPORT

> Generated: 2026-05-15T15:13:25.838Z

## Classification Summary

| Classification | Count | Action |
|---|---|---|
| `architecture_debt` | 306 | Genuine orphan — no code imports this file |
| `protected_surface` | 52 | Governance surface — human-only resolution |

## Aggregate

- Mirror entries: **5243**
- Mirror orphans (`graph/orphan`): **358** (6.8%)
- Governance surface: 52
- Non-governance: 306
- False negatives (PULSE critical, mirror missed): **0**
- Stale mirror artifacts: **0**
- PULSE totalOrphans: **518**
- PULSE orphanFiles: **518**
- PULSE criticalOrphanFiles: **0**
- PULSE total matches orphanFiles: **true**
- PULSE critical subset of orphanFiles: **true**
- PULSE orphan artifact stale: **false**
- Protected boundary source: `ops/protected-governance-files.json` (12 exact, 5 prefixes)

## By Surface

- source: 271
- governance: 54
- backend: 20
- ui: 9
- worker: 4

## architecture_debt (306)

- `.backup-manifest.json` — Confirmed orphan by PULSE scope engine
- `.backup-policy.json` — Confirmed orphan by PULSE scope engine
- `.cspell.json` — Confirmed orphan by PULSE scope engine
- `.data-retention.json` — Confirmed orphan by PULSE scope engine
- `.github/branch-protection.json` — Confirmed orphan by PULSE scope engine
- `.github/CODEOWNERS` — Confirmed orphan by PULSE scope engine
- `.github/copilot-instructions.md` — Confirmed orphan by PULSE scope engine
- `.github/dependabot.yml` — Confirmed orphan by PULSE scope engine
- `.github/pull_request_template.md` — Confirmed orphan by PULSE scope engine
- `.husky/_/applypatch-msg` — Confirmed orphan by PULSE scope engine
- `.husky/_/commit-msg` — Confirmed orphan by PULSE scope engine
- `.husky/_/h` — Confirmed orphan by PULSE scope engine
- `.husky/_/husky.sh` — Confirmed orphan by PULSE scope engine
- `.husky/_/post-applypatch` — Confirmed orphan by PULSE scope engine
- `.husky/_/post-checkout` — Confirmed orphan by PULSE scope engine
- `.husky/_/post-commit` — Confirmed orphan by PULSE scope engine
- `.husky/_/post-merge` — Confirmed orphan by PULSE scope engine
- `.husky/_/post-rewrite` — Confirmed orphan by PULSE scope engine
- `.husky/_/pre-applypatch` — Confirmed orphan by PULSE scope engine
- `.husky/_/pre-auto-gc` — Confirmed orphan by PULSE scope engine
- `.husky/_/pre-commit` — Confirmed orphan by PULSE scope engine
- `.husky/_/pre-merge-commit` — Confirmed orphan by PULSE scope engine
- `.husky/_/pre-push` — Confirmed orphan by PULSE scope engine
- `.husky/_/pre-rebase` — Confirmed orphan by PULSE scope engine
- `.husky/_/prepare-commit-msg` — Confirmed orphan by PULSE scope engine
- `.husky/pre-commit` — Confirmed orphan by PULSE scope engine
- `.markdownlint-cli2.yaml` — Confirmed orphan by PULSE scope engine
- `.markdownlint.json` — Confirmed orphan by PULSE scope engine
- `.mcp.json` — Confirmed orphan by PULSE scope engine
- `.prettierrc.json` — Confirmed orphan by PULSE scope engine
- `.release-please-manifest.json` — Confirmed orphan by PULSE scope engine
- `backend/dd-trace-init.cjs` — Confirmed orphan by PULSE scope engine
- `backend/Dockerfile` — Confirmed orphan by PULSE scope engine
- `backend/README.md` — Confirmed orphan by PULSE scope engine
- `backend/src/auth/email-templates/cart-recovery.html` — Confirmed orphan by PULSE scope engine
- `backend/src/auth/email-templates/data-deletion-confirmation.html` — Confirmed orphan by PULSE scope engine
- `backend/src/auth/email-templates/data-request-confirmation.html` — Confirmed orphan by PULSE scope engine
- `backend/src/auth/email-templates/magic-link.html` — Confirmed orphan by PULSE scope engine
- `backend/src/auth/email-templates/onboarding-day1.html` — Confirmed orphan by PULSE scope engine
- `backend/src/auth/email-templates/onboarding-day3.html` — Confirmed orphan by PULSE scope engine
- ... and 266 more

## protected_surface (52)

- `.codacy.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/ci-cd.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/claude-code-review.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/claude.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/codacy-analysis.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/codeql.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/dependabot-auto-merge.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/deploy-production.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/deploy-staging.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/deploy.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/main.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/mind-simulator.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/nightly-ops-audit.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/release-please.yml` — Matches ops/protected-governance-files.json
- `.github/workflows/visual-regression.yml` — Matches ops/protected-governance-files.json
- `.husky/commit-msg` — Matches ops/protected-governance-files.json
- `.husky/pre-push` — Matches ops/protected-governance-files.json
- `AGENTS.md` — Matches ops/protected-governance-files.json
- `backend/eslint.config.mjs` — Matches ops/protected-governance-files.json
- `CLAUDE.md` — Matches ops/protected-governance-files.json
- `docs/codacy/applied-overrides.md` — Matches ops/protected-governance-files.json
- `docs/codacy/convergence-checkpoint-2026-04-14.md` — Matches ops/protected-governance-files.json
- `docs/codacy/max-rigor-lock.md` — Matches ops/protected-governance-files.json
- `docs/codacy/noise-disable-rollback.json` — Matches ops/protected-governance-files.json
- `docs/codacy/noise-patterns.json` — Matches ops/protected-governance-files.json
- `docs/codacy/tool-uuids.json` — Matches ops/protected-governance-files.json
- `docs/codacy/wrong-rule-cleanup-2026-04-15.md` — Matches ops/protected-governance-files.json
- `docs/design/KLOEL_ANTI_HARDCODE_CONTRACT.md` — Matches ops/protected-governance-files.json
- `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md` — Matches ops/protected-governance-files.json
- `frontend/eslint.config.mjs` — Matches ops/protected-governance-files.json
- `ops/component-registry.json` — Matches ops/protected-governance-files.json
- `ops/dangerously-set-exceptions.json` — Matches ops/protected-governance-files.json
- `ops/governance-change-approvals.json` — Matches ops/protected-governance-files.json
- `ops/kloel-ai-constitution.json` — Matches ops/protected-governance-files.json
- `ops/kloel-design-tokens.json` — Matches ops/protected-governance-files.json
- `ops/model-string-registry.json` — Matches ops/protected-governance-files.json
- `ops/protected-governance-files.json` — Matches ops/protected-governance-files.json
- `ops/ratchet-baseline.json` — Matches ops/protected-governance-files.json
- `ops/skipped-tests-approvals.json` — Matches ops/protected-governance-files.json
- `ops/test-deletion-approvals.json` — Matches ops/protected-governance-files.json
- ... and 12 more

## Truth Gap Analysis

The mirror daemon (`__parts__/obsidian-mirror-daemon-content.mjs:202`) applies the `graph/orphan` tag based solely on `extractRelations()` — a regex import scanner. This is structurally different from PULSE scope engine orphan detection (`scope-engine/build-state.ts:215`), which builds a full import graph with resolved paths.

### Gap 1 — Cosmetic orphan (false_positive_mirror)

Mirror tags a file as orphan because its regex didn't find imports. But PULSE scope engine has the same file with non-orphan status. The mirror `extractRelations()` is a regex heuristic; PULSE uses real path resolution. Fix: mirror should ask PULSE scope state before applying the `graph/orphan` tag.

### Gap 2 — Missed orphan (false_negative)

PULSE scope engine identifies a critical orphan source file, but mirror does NOT tag it because `extractRelations()` found one import (e.g. from `node_modules`). The mirror treats any import as a "connection" — even dead/resolved-to-nothing imports. Fix: mirror relation extraction should only count imports that resolve to real repo files.

### Gap 3 — No cause classification

Mirror orphans are undifferentiated. The same `graph/orphan` tag means "source was deleted" or "protected governance surface" or "truly orphaned code". This makes the graph noisy instead of actionable. This report provides the differentiation from runtime artifacts plus the protected boundary manifest.

### Recommended fix (patch plan)

1. **Implemented in mirror metadata**: Read `PULSE_SCOPE_ORPHANS.json` before applying `graph/orphan` on regenerated source notes.
2. **Implemented in this report**: Split mirror orphan noise into stale mirror artifacts, protected surfaces, false positives, and architecture debt.
3. **Requires PULSE run when stale**: Regenerate `PULSE_SCOPE_ORPHANS.json` after `PULSE_SCOPE_STATE.json` before trusting orphan debt as current architecture debt.

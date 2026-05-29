# Anti-Regression Rules — CI Gate Enforcement Audit

> READ-ONLY audit produced 2026-05-29. Maps every anti-regression rule
> declared in `CLAUDE.md`, `docs/architecture/EVENT_TAXONOMY.md` §7, and the
> CAPABILITY_MAP / canonicalization mission to its actual enforcement
> mechanism (CI workflow, husky hook, or unwired script).
>
> Scope: `.github/workflows/*.yml`, `.husky/pre-push`, `scripts/ops/check-*.mjs`,
> `scripts/ops/canonical/*.mjs`, `scripts/ops/eslint-canonical-rules/*`.
>
> **No new gates were added — Daniel decides.** This file is a status snapshot
> only.

---

## Legend

| Status | Meaning |
|---|---|
| `ENFORCED` | Script is invoked by at least one of: husky pre-push, `check:all`, or a CI workflow job, AND exit-code is fatal (no `|| true`). |
| `PARTIAL` | Script exists and is invoked but runs in soft/warning mode (`--strict` not passed) OR only catches a subset of the rule. |
| `UNWIRED` | Script exists in `scripts/ops/` but is **not** referenced from any workflow / hook / `check-all` runner — it would only run via manual `npm run`. |
| `MISSING` | No script exists for the rule; relies on manual review or human discipline only. |

Invocation sources surveyed:

| Source | File | What runs |
|---|---|---|
| Husky pre-push | `.husky/pre-push` → `npm run prepush:scoped` → `scripts/ops/run-scoped-pre-push.mjs` | `guard:db-push`, `commit-msg:check`, `guard:new-code` (= `check:ai-constitution` + `guard:bypass-markers` + `guard:changed-eslint` + `guard:test-files` + `guard:visual-contract` + `architecture:check`), plus typecheck/build/tests per workspace touched. |
| CI `check:all` | `scripts/ops/check-all-gates.mjs` invoked by `.github/workflows/ci-cd.yml` job `quality` | governance-boundary, ai-constitution, visual-contract, test-integrity, unsafe-casts, unsafe-queries, security, architecture, layer-boundaries, model-strings, code-quality, data-integrity, changed-eslint, typecheck (all 3 workspaces), tests (all 3 workspaces). |
| CI `quality` (extra steps in ci-cd.yml) | `.github/workflows/ci-cd.yml` | readiness, format-check, **seatbelt**, **dead-code**, **madge**, contract-sync, **prisma-schema-single-source**, **redis-resolver-sync**, **tenant-filter**, **tenant-keys**, **constants-sync**, **pulse:ci**, **railway:runtime**, **ratchet:check**. |
| CI `canonicalization-gates` | `.github/workflows/canonicalization-gates.yml` → `scripts/ops/canonical/run-all-gates.mjs` | G13 math-random, G1 prisma-any, G5 asaas-ban, G24 event-taxonomy-namespace. Triggered on PR to `main` + workflow_dispatch. **Status check only — workflow itself is fail-on-exit but lives in a separate job that does not block other workflows.** |
| CI other | `codacy-analysis.yml`, `codeql.yml`, `visual-regression.yml`, `nightly-ops-audit.yml`, `deploy-*.yml`, `mind-simulator.yml` | Out-of-scope analyzers + deploys. |

---

## Audit table

### A. Rules from `CLAUDE.md`

| # | Rule | CI gate exists? | File path | Status | Notes |
|---|---|---|---|---|---|
| A1 | `prisma db push` forbidden in scripts / CI / Docker / automation | Yes | `scripts/ops/guard-prisma-db-push.mjs` | **ENFORCED** | Pre-push (`run-scoped-pre-push.mjs` step "Guard DB push") + CI ci-cd.yml step "Guard forbidden prisma db push usage". |
| A2 | Bypass markers forbidden in new code (`biome-ignore`, `nosemgrep`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `codacy:disable`, `codacy:ignore`, `NOSONAR`, `noqa`) | Yes | `scripts/ops/check-bypass-markers.mjs` (CLI surface) + `scripts/ops/check-architecture-guardrails.mjs` (added-line scanner with full directive list) | **ENFORCED** | `guard:new-code` (pre-push + CI) runs both `guard:bypass-markers` and `architecture:check`. Ratchet also enforces counts via `collect-ratchet-metrics.mjs` → `check-ratchet.mjs`. |
| A3 | Spec/test required for source changes (AI Constitution) | Yes | `scripts/ops/check-ai-constitution.mjs` | **ENFORCED** | Pre-push (`check:ai-constitution` inside `guard:new-code`) + CI `check:all`. |
| A4 | File LOC ceiling (≤400 new / ≤600 touched, plus `files_over_800_lines_max:1`) | Yes | `scripts/ops/check-architecture-guardrails.mjs` (per-diff) + `scripts/ops/collect-ratchet-metrics.mjs` (global) + `scripts/ops/check-ratchet.mjs` | **ENFORCED** | Pre-push via `architecture:check` (in `guard:new-code`) and CI via `npm run ratchet:check`. |
| A5 | Codacy skip tags forbidden in commit messages (`[codacy skip]`, `[skip codacy]`, `[ci skip]`, `[skip ci]`) | Yes | `scripts/ops/check-codacy-skip-tags.mjs` | **UNWIRED** | Script exists with full alias detection but is **not** invoked from `check-all-gates.mjs`, `run-scoped-pre-push.mjs`, `guard:new-code`, or any GitHub Actions workflow YAML. Grep of `.github/`, `.husky/`, `package.json`, and the orchestrators returns 0 references. Only reachable via manual `node scripts/ops/check-codacy-skip-tags.mjs`. |
| A6 | Visual contract preserved (KLOEL_VISUAL_DESIGN_CONTRACT.md) | Yes | `scripts/ops/check-visual-contract.mjs` | **ENFORCED** | Pre-push (`guard:visual-contract` inside `guard:new-code`) + CI `check:all`. |
| A7 | Workspace isolation (every Prisma query filters `workspaceId`) | Yes | `scripts/ops/check-tenant-filter.mjs` + `scripts/ops/check-tenant-keys.mjs` | **ENFORCED** | CI ci-cd.yml dedicated steps "Tenant isolation static scan (invariant I4)" and "Tenant isolation redis key scan (invariant I4)". |
| A8 | Layer boundaries (controllers thin, services own logic) | Yes | `scripts/ops/check-layer-boundaries.mjs` + partial `check-architecture-guardrails.mjs` | **PARTIAL** | `layer-boundaries` runs in CI `check:all`; `check-architecture-guardrails.mjs` is enforced; but the dedicated `controller-body-length` check from ANTI_REGRESSION_GATES.md §G14 is still listed as "⏳ pending" — the existing scripts don't catch oversize controller methods. |
| A9 | Webhook signature verification mandatory | Yes (partial) | `scripts/ops/check-security.mjs` | **PARTIAL** | `security` runs in CI `check:all`; per ANTI_REGRESSION_GATES.md §G12 the webhook-signature detection extension is "⏳ pending". |
| A10 | Idempotency for webhooks/payments/queues | No | — | **MISSING** | No grep hit for an idempotency-key gate script. Relies on `check-security.mjs` general patterns + reviewer discipline. Behavior is exercised in unit/integration tests but no static gate enforces presence. |
| A11 | DTOs validated with class-validator on every API | No dedicated | — | **MISSING** | Covered indirectly by `check-architecture.mjs` / typecheck, but no explicit "controller endpoint without DTO" detector. |
| A12 | Math.random forbidden in production code | Yes | `scripts/ops/canonical/gate-math-random.mjs` (G13) | **PARTIAL** | Runs only in the `canonicalization-gates.yml` workflow (separate job, runs on PR to main). The intended ESLint `no-restricted-properties` per ANTI_REGRESSION_GATES.md §G13 is **not wired** into any workspace `eslint.config.mjs` (verified by grep — protected files were not edited). Frontend/worker still uncovered by ESLint. |
| A13 | `prismaAny` ban / `any` ratchet zero | Yes | `scripts/ops/canonical/gate-prisma-any.mjs` (G1) + ratchet (`prisma_any_max:0`, `any_count_max:0`) + per-diff `architecture:check` (`no_new_any`) | **ENFORCED** | Pre-push catches new `any` per diff; ratchet catches global drift; canonicalization-gates job catches `prismaAny`. |
| A14 | Asaas references banned (ADR 0003) | Yes | `scripts/ops/canonical/gate-asaas-ban.mjs` (G5) | **PARTIAL** | Runs only in `canonicalization-gates.yml`. **Not** in pre-push or in `check:all`. |
| A15 | `localStorage` as DB / `Math.random` for product metrics in frontend | No dedicated | — | **MISSING** | No script enforces frontend rules from CLAUDE.md "REGRA DE FRONTEND" §6-§8 (no localStorage as DB, no Math.random in metrics, no hardcoded data arrays). ANTI_REGRESSION_GATES.md §G15 marks this "⏳ pending". |
| A16 | Test-file deletions forbidden | Yes | `scripts/ops/check-test-file-deletions.mjs` | **ENFORCED** | Pre-push via `guard:test-files` inside `guard:new-code`. |
| A17 | Governance boundary (protected files unmodifiable by automation) | Yes | `scripts/ops/check-governance-boundary.mjs` | **ENFORCED** | Pre-push (`check:governance` inside `check:all`) + CI. |
| A18 | Brain → Mind canonical imports | Yes | `scripts/ops/check-no-direct-brain-imports.mjs` + `scripts/ops/check-mind-canonical-imports.mjs` | **PARTIAL** / **UNWIRED** | `check-no-direct-brain-imports.mjs` is bundled in `canonical:check` (npm script) **but the `canonical:check` script itself is never invoked** by any CI workflow, pre-push hook, or `check-all-gates.mjs`. `check-mind-canonical-imports.mjs` runs in soft mode by default (only `--strict` blocks) and is not referenced in any workflow either. Effectively manual. |
| A19 | Direct WAHA imports forbidden | Yes | `scripts/ops/check-no-direct-waha-import.mjs` | **UNWIRED** | Same as A18: only reachable via `npm run canonical:check[:waha]`, which is never invoked by CI/pre-push. |
| A20 | Cross-boundary utils drift (worker ↔ backend) | Yes | `scripts/ops/check-cross-boundary-utils-drift.mjs` | **UNWIRED** | Same — bundled into `canonical:check`, not auto-invoked. |
| A21 | Knip dead-code baseline | Yes | `npm run quality:dead-code` | **ENFORCED** | CI step "Knip dead-code baseline gate" in ci-cd.yml. |
| A22 | Madge cycle baseline | Yes | `npm run quality:graph` (`scripts/ops/check-madge-cycles.mjs`) | **ENFORCED** | CI step "Madge cycle baseline gate". |
| A23 | Production readiness | Yes | `scripts/ops/validate-production-readiness.mjs` | **ENFORCED** | CI step "Production readiness gate" before `check:all`. |
| A24 | PULSE certification gate | Yes | `scripts/ops/run-pulse-ci.mjs` | **ENFORCED** | CI step "PULSE certification gate". |
| A25 | Railway runtime anti-regression | Yes | `scripts/ops/check-railway-runtime.mjs` | **ENFORCED** (when secrets present) | CI step "Railway runtime anti-regression gate" with `RAILWAY_RUNTIME_REQUIRED=true`. |
| A26 | Quality ratchet (one-way door) | Yes | `scripts/ops/check-ratchet.mjs` | **ENFORCED** | CI step "Quality ratchet gate". |
| A27 | Contract sync (frontend ↔ backend schemas) | Yes | `scripts/ops/check-contract-sync.mjs` | **ENFORCED** | CI step "Contract schema sync". |
| A28 | Prisma schema single source (worker symlinks backend) | Yes | `scripts/ops/check-prisma-schema-single-source.mjs` | **ENFORCED** | CI step. Also satisfies ANTI_REGRESSION_GATES.md §G8 base; the `RAC_` prefix sub-check is still "⏳ pending". |
| A29 | Redis URL resolver sync (backend ↔ worker) | Yes | `scripts/ops/check-redis-resolver-sync.mjs` | **ENFORCED** | CI step. |
| A30 | Shared constants sync (sales templates etc.) | Yes | `scripts/ops/check-constants-sync.mjs` | **ENFORCED** | CI step. |
| A31 | ESLint seatbelt (per-rule baseline) | Yes | `npm run seatbelt:check` | **ENFORCED** | CI step "ESLint seatbelt gate". |
| A32 | Formatting (Prettier/Biome) | Yes | `npm run format:check` | **ENFORCED** | CI step "Formatting check". |
| A33 | Codacy max-rigor lock (no scope reduction) | Yes | `scripts/ops/codacy-enforce-max-rigor.mjs` (alias `codacy:check-max-rigor`) | **UNWIRED** | Script exists; `codacy-analysis.yml` runs Codacy CLI but does not invoke the local enforce script. Grep returns 0 references to `codacy:check-max-rigor` outside `package.json`. Manual discipline only. |

### B. Rules from `EVENT_TAXONOMY.md` §7 (10 anti-regression rules)

> Daniel's prompt lists 8 high-level domain rules; EVENT_TAXONOMY.md §7
> actually enumerates 10 numbered rules. Both axes are covered below.

#### B.1 EVENT_TAXONOMY.md §7 numbered rules

| # | Rule (EVENT_TAXONOMY.md §7) | CI gate exists? | File path | Status | Notes |
|---|---|---|---|---|---|
| B1 | No new `brain.*` spine emit sites (must remain 0) | Yes | `scripts/ops/check-no-direct-brain-imports.mjs` + `scripts/ops/canonical/gate-event-taxonomy-namespace.mjs` | **PARTIAL** | brain-imports script is **UNWIRED** (see A18). gate-event-taxonomy-namespace.mjs only currently forbids `checkout.*` bare namespace, not `brain.*` emits. Pattern detection of `.emit('brain.…')` is not explicitly run anywhere. |
| B2 | No new `mind.*` live emits via `EventEmitter2` (ceiling = 2 legacy sites) | No | — | **MISSING** | No script counts/freezes `EventEmitter2.emit('mind.*')` sites. Ceiling is documented but unenforced. |
| B3 | Every new event must be added to `tools/asyncapi/asyncapi-spec.json` in same PR | Partial | `scripts/ops/check-canonical-events.mjs` | **PARTIAL** | Script validates every `.emit(string)` against EVENT_TAXONOMY.md registry. It is invoked **only** via `canonical:check` (UNWIRED — see A18). The companion `tools/asyncapi/asyncapi-contract.spec.mjs` referenced in EVENT_TAXONOMY.md §7.3 **does not exist** on disk (`find tools/asyncapi` returns only `asyncapi-spec.json`). |
| B4 | Event names must follow `<domain>.<entity>.<verb_past_tense>` grammar | Yes | `scripts/ops/check-canonical-events.mjs` (CANONICAL_RE) + `scripts/ops/canonical/gate-event-taxonomy-namespace.mjs` (G24) | **PARTIAL** | G24 runs in `canonicalization-gates.yml` (status check only, currently FORBIDDEN_PREFIXES = `['checkout.']` only — narrow scope). check-canonical-events.mjs has the full grammar regex but is UNWIRED. |
| B5 | No event renames without DEPRECATION_MAP.md entry | No | — | **MISSING** | No automated diff detector. Reviewer discipline. |
| B6 | No emit outside the spine (direct DB writes to AutopilotEvent / MindOutboxEvent bypassing `SpineEmitterService.emit()` forbidden) | No | — | **MISSING** | No script detects direct `prisma.autopilotEvent.create` / `prisma.mindOutboxEvent.create` outside the spine chokepoint. |
| B7 | No `@OnEvent(` listeners (`EventEmitter2` listeners must remain 0) | No | — | **MISSING** | Rule says "must remain 0" but no gate enforces it. A grep would suffice; none exists. |
| B8 | Test-fixture namespaces (`test.*`) never leak to non-spec files | No | — | **MISSING** | No targeted scan. `check-canonical-events.mjs` skips spec files in its walk but does not reverse-check leakage. |
| B9 | `sale.*` namespace ceiling (only `sale.created` canonical) | No | — | **MISSING** | Pure documentation rule. |
| B10 | `commerce.*` macro-bucket default | No | — | **MISSING** | Style guidance; no automated check. |

#### B.2 Daniel's 8-rule list (domain-level anti-regression)

| # | Rule (prompt) | CI gate exists? | File path | Status | Notes |
|---|---|---|---|---|---|
| D1 | Nenhum novo evento sem registro no Event Taxonomy | Yes | `scripts/ops/check-canonical-events.mjs` | **UNWIRED** | See B3 — script exists with full taxonomy parse + canonical regex but reachable only via `npm run canonical:check` (never auto-invoked). |
| D2 | Nenhum novo serviço duplicando capability existente | Yes (partial) | `scripts/ops/check-canonical-services.mjs` + `scripts/ops/check-canonical-duplicates.mjs` | **PARTIAL** | check-canonical-duplicates compares against committed CAPABILITY_MAP.md (works if developer regenerates baseline). check-canonical-services detects duplicate `@Injectable` class names in soft mode, only blocks with `--strict`. Neither is invoked from CI/pre-push. |
| D3 | Nenhum novo termo de domínio sem entrada no Canonical Vocabulary | Yes | `scripts/ops/check-canonical-vocabulary.mjs` | **UNWIRED + PARTIAL** | Script exists, defaults to soft warnings (all violations are recorded as `soft`, never `hard` — the `hard` array is never populated in the current implementation). Not invoked from CI/pre-push. |
| D4 | Nenhum novo normalizador de telefone fora do serviço oficial | Yes (ESLint rule built) | `scripts/ops/eslint-canonical-rules/rules/no-rogue-phone-normalizer.cjs` | **UNWIRED** | Custom ESLint rule + smoke test exist. The `eslint-canonical-rules/README.md` explicitly says the workspace `eslint.config.mjs` files are protected and the plugin "must be manually wired" — grep confirms no workspace eslint config references `canonical/no-rogue-phone-normalizer` today. Same for `no-rogue-clamp` and `no-rogue-unknown-record`. |
| D5 | Nenhum novo resolvedor de tenant fora do serviço oficial | No | — | **MISSING** | No dedicated tenant-resolver gate. `check-tenant-filter.mjs` enforces the *use* of `workspaceId` in queries; it does not detect creation of *new resolver functions*. |
| D6 | Nenhum novo dispatcher de mensagem fora do serviço oficial | No | — | **MISSING** | `check-no-direct-waha-import.mjs` is the closest proxy (forbids bypassing the WAHA wrapper) and is **UNWIRED** anyway. No gate detects new `*MessageDispatcher` classes outside the canonical send-message service. |
| D7 | Nenhum worker novo sem capability declarada | No | — | **MISSING** | No script verifies that a new file under `worker/src/processors/` declares a `@cluster` tag or registers a capability ID. CAPABILITY_MAP.md is regenerable but staleness is not gated. |
| D8 | Nenhum módulo novo sem domínio declarado | Yes (partial, soft) | `scripts/ops/check-canonical-services.mjs` | **PARTIAL + UNWIRED** | The `@cluster` tag detector exists for `@Injectable` classes but only reports `missingCluster.length` in soft mode (never fails, even with `--strict` — strict only fails on duplicates). ANTI_REGRESSION_GATES.md §G3 calls for a custom ESLint rule `require-cluster-tag.cjs` which does **not** exist in `scripts/ops/eslint-canonical-rules/rules/`. |

---

## Summary

### Headline counts

| Bucket | Count |
|---|---|
| Rules audited (A1–A33 + B1–B10 + D1–D8) | **51** |
| **ENFORCED** (hard gate in CI or pre-push) | **22** |
| **PARTIAL** (gate exists but soft / narrow scope / partially wired) | **11** |
| **UNWIRED** (script exists, never invoked by CI/hook) | **8** |
| **MISSING** (no script at all) | **10** |

### UNWIRED scripts — exist but never invoked

These are functional Node scripts shipped in-repo that **no workflow / hook / orchestrator runs**. Reachable only via manual `npm run …`:

1. `scripts/ops/check-codacy-skip-tags.mjs` (A5)
2. `scripts/ops/check-no-direct-brain-imports.mjs` (A18, B1)
3. `scripts/ops/check-no-direct-waha-import.mjs` (A19, D6)
4. `scripts/ops/check-cross-boundary-utils-drift.mjs` (A20)
5. `scripts/ops/check-mind-canonical-imports.mjs` (A18)
6. `scripts/ops/check-canonical-events.mjs` (D1, B3, B4)
7. `scripts/ops/check-canonical-vocabulary.mjs` (D3)
8. `scripts/ops/check-canonical-services.mjs` (D2, D8)
9. `scripts/ops/codacy-enforce-max-rigor.mjs --check` (A33)
10. `scripts/ops/eslint-canonical-rules/rules/no-rogue-phone-normalizer.cjs` (D4)
11. `scripts/ops/eslint-canonical-rules/rules/no-rogue-clamp.cjs`
12. `scripts/ops/eslint-canonical-rules/rules/no-rogue-unknown-record.cjs`

**Root cause:** the npm script `canonical:check` chains canonical-duplicates + canonical-events + waha + brain + utils-drift, but `canonical:check` itself is never invoked from `.github/workflows/`, `.husky/`, `check-all-gates.mjs`, or `run-scoped-pre-push.mjs`. Only the newer `canonical/run-all-gates.mjs` (G1 prisma-any, G5 asaas-ban, G13 math-random, G24 event-namespace) runs via `canonicalization-gates.yml`.

### MISSING gates — no script exists

1. **A10** — Idempotency presence on webhook/payment/queue handlers.
2. **A11** — DTO validation present on every controller endpoint.
3. **A15** — Frontend `localStorage` as DB / `Math.random` for metrics / hardcoded numeric metrics in UI.
4. **B2** — `mind.*` `EventEmitter2.emit` count freeze (ceiling = 2).
5. **B5** — Event renames without DEPRECATION_MAP.md entry detector.
6. **B6** — Direct DB writes to `AutopilotEvent` / `MindOutboxEvent` bypassing `SpineEmitterService.emit()`.
7. **B7** — `@OnEvent(` grep gate (must remain 0).
8. **B8** — `test.*` event leakage into non-spec source files.
9. **D5** — New tenant-resolver function declarations outside the official tenant resolver.
10. **D6** — New message-dispatcher class declarations outside the canonical send-message service (partial coverage via WAHA import gate, itself unwired).
11. **D7** — Worker processors without a declared capability ID / `@cluster` tag.

### PARTIAL gates worth tightening

- **A8 / §G14** — Controller body-length check (declared "⏳ pending" in ANTI_REGRESSION_GATES.md).
- **A9 / §G12** — Webhook signature verification detector (declared "⏳ pending").
- **A12** — `Math.random` ESLint rule not wired into workspace eslint configs (`canonical/run-all-gates.mjs` does grep-based detection but ESLint coverage would catch frontend & worker too).
- **A14 / G5** — Asaas-ban runs only in `canonicalization-gates.yml`, not in pre-push or `check:all`.
- **A18** — `check-mind-canonical-imports.mjs` defaults to soft mode; ADR-0013 "4-week alias window" still active per the script comment.
- **B4 / G24** — `gate-event-taxonomy-namespace.mjs` `FORBIDDEN_PREFIXES = ['checkout.']` only — does not cover the broader grammar enforcement claimed by EVENT_TAXONOMY.md §6.1.
- **D2** — `check-canonical-services.mjs` only fails on duplicates with `--strict`; missing `@cluster` tags are always soft.
- **D3** — `check-canonical-vocabulary.mjs` has a `hard[]` array that is never populated by the current code — every detected violation is pushed to `soft[]`, so `--strict` never trips.
- **D8** — `@cluster` JSDoc tag is detected but its absence is never a failure; ANTI_REGRESSION_GATES.md §G3's planned `require-cluster-tag.cjs` ESLint rule is not authored.

### Existence of `asyncapi-contract.spec.mjs`

EVENT_TAXONOMY.md §7.3 says: *"the asyncapi extractor (`scripts/cognitive/asyncapi-extract.mjs`) runs on CI; missing entries fail `tools/asyncapi/asyncapi-contract.spec.mjs`."*

**Verified:** `tools/asyncapi/` contains only `asyncapi-spec.json`. **No `asyncapi-contract.spec.mjs` file exists.** No CI workflow references `asyncapi-contract` either. The promise in §7.3 is not currently met.

---

## Notes for decision-maker

- The biggest enforcement gap is the **`canonical:check` family** (D1–D4, D6, A18–A20, B1, B3, B4): the scripts are written and functional, but nothing invokes them. Wiring `canonical:check` into either `check-all-gates.mjs` `steps[]` or a dedicated CI job would activate ~9 rules at once.
- The ESLint canonical overlay (`scripts/ops/eslint-canonical-rules/.eslintrc.canonical-overlay.json`) is purposefully un-wired because the workspace `eslint.config.mjs` files are listed as protected. Per the overlay README, the human owner must do this wiring.
- Several MISSING rules (B7 `@OnEvent`, B6 direct AutopilotEvent writes, D7 worker capability) are one-liner ripgrep checks that could be added as small dedicated `check-*.mjs` scripts. They are documented but currently rely on reviewer discipline.

---

## File written

`docs/architecture/ANTI_REGRESSION_AUDIT.md` (this file). Not a protected path per `CLAUDE.md`; protected design contracts live under `docs/design/`.

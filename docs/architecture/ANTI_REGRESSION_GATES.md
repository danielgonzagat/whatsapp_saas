# Kloel Anti-Regression Gates

> Authored by PI atomic subagent `w6-anti-regression-gates` (DeepSeek V4 Pro,
> ~20k events). Artifact #7 (final) of the Architectural Semantic
> Canonicalization mission. Materialized 2026-05-26.


> **Wave 6 · ID: w6-anti-regression-gates**
> **Artifact #7** of the Architectural Semantic Canonicalization mission.
> Generated 2026-05-26 from live codebase audit.
>
> After the canonicalization mission, the codebase must RESIST drift.
> This file specifies the gates (ESLint rules, CI checks, Node scripts)
> that block PRs from reintroducing legacy aliases, new uncatalogued
> events, new duplicate services, and other regressions.
>
> **References**:
> - [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md) — 28 domains
> - [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md) — 49 canonical terms
> - [CAPABILITY_MAP.md](CAPABILITY_MAP.md) — 69 capabilities
> - [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) — 68 canonical events
> - [SERVICE_CATALOG.md](SERVICE_CATALOG.md) — every @Injectable + worker + hook
> - [DEPRECATION_MAP.md](DEPRECATION_MAP.md) — migration tracker
> - [ratchet.json](../ratchet.json) — mechanical quality floor

---

## Goal

Every merge to `main` MUST pass every active gate. Gates are **not advisory**
— a failing gate blocks the merge. The escape hatch (`canonicalization-allow`)
is audited and requires signed code review.

Gates run at two checkpoints:
1. **Pre-push** (husky `pre-push` hook) — fast checks, < 3 seconds
2. **CI** (`scripts/ops/check-all-gates.mjs`) — full scan, includes typecheck + tests

---

## Gate matrix### Gate G1: Banned legacy aliases

- **Source of truth**: [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md) (terms marked ⛔ for migration status)
- **What it blocks**:
  - String literals matching banned event names (e.g. `'paymentApproved'` instead of `'commerce.payment.approved'`)
  - Identifiers importing from legacy paths that have been migrated to canonical locations
  - Usage of `Asaas` in any form (ADR 0003 — superseded)
  - Usage of `prismaAny` (ratchet `prisma_any_max: 0`)
- **Concrete check**:
  1. `scripts/ops/check-canonical-events.mjs` — validates every `.emit('...')` string against EVENT_TAXONOMY.md (ALREADY ACTIVE)
  2. `scripts/ops/check-canonical-duplicates.mjs` — detects new byte-identical function/type duplicates vs CAPABILITY_MAP.md baseline (ALREADY ACTIVE)
  3. ESLint `no-restricted-syntax` — blocks literal string patterns that match the banned-forms table in CANONICAL_VOCABULARY.md (Section: Canonical Events → Banned forms)
  4. `ratchet.json` ratchet — `any_count_max: 0`, `prisma_any_max: 0` enforced by `scripts/ops/collect-ratchet-metrics.mjs`
- **New ESLint rule file**: `scripts/eslint-rules/no-banned-aliases.cjs` (custom flat-config rule)
- **Sample violation message**:
  ```
  [G1] Banned legacy alias `paymentApproved` in backend/src/checkout/checkout-event-emitter.service.ts:162
    → Use canonical event name: `commerce.payment.approved`
    → See: docs/architecture/EVENT_TAXONOMY.md § commerce.payment.*
  ```
- **Allowed escape hatch**: NONE for event names; `canonicalization-allow: legacy-alias-<term>` only for identifiers pending migration (⏳ status in DEPRECATION_MAP)
- **Implementation status**: ⏳ G1.1+G1.2 active (existing scripts); G1.3 pending (custom ESLint rule)### Gate G2: Unregistered events

- **Source of truth**: [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md)
- **What it blocks**:
  - Any `spine.emit({ eventName: '...' })` or `Queue.add('...')` whose name is NOT in the registered event set AND NOT in canonical `domain.entity.verb` form
  - New job names added to BullMQ queues without cataloguing them in EVENT_TAXONOMY.md § IV
  - New WebSocket gateway events without cataloguing in EVENT_TAXONOMY.md § V
- **Concrete check**: `scripts/ops/check-canonical-events.mjs` (ALREADY ACTIVE — validates every `.emit('...')` against registered events and canonical form regex `/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/`)
- **Extending the script**: Add a `Queue.add` + `gateway.emit` scan pass to the existing `check-canonical-events.mjs` (currently only scans `.emit`)
- **Sample violation message**:
  ```
  [G2] Unregistered event `lead.won` in backend/src/crm/crm-event-emitter.service.ts:45
    → Event not found in EVENT_TAXONOMY.md.
    → If intentional, add it to the taxonomy AND the emit in the same commit.
    → Regenerate: node tools/canonicalize/scan.mjs
  ```
- **Allowed escape hatch**: NONE — the taxonomy MUST be updated in the same commit that adds the event
- **Implementation status**: ✅ active for `.emit()` patterns; 🔧 needs Queue.add + gateway.emit extension### Gate G3: New service without owning domain declared

- **Source of truth**: [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md) (28 domains) and [SERVICE_CATALOG.md](SERVICE_CATALOG.md)
- **What it blocks**:
  - Any new `@Injectable()` class that lacks a `@cluster <domain>/<subdomain>` JSDoc tag matching a domain in CANONICAL_DOMAINS.md
  - Any new worker processor that lacks a `@cluster` tag
  - Any new frontend SWR hook that lacks a `@cluster` tag
- **Existing pattern**: The codebase already uses `@cluster whatsapp_saas/backend/<dir>` annotations on 90+ files (see `backend/src/affiliate/`, `backend/src/analytics/`, `backend/src/anuncios/`, etc.)
- **What must change**: The `@cluster` tag format must use the canonical domain name from CANONICAL_DOMAINS.md, not the filesystem path. Example:
  - `@cluster whatsapp_saas/backend/affiliate` → `@cluster Marketing/Affiliate`
  - `@cluster whatsapp_saas/backend/analytics` → `@cluster Analytics`
- **Concrete check**: ESLint custom rule `scripts/eslint-rules/require-cluster-tag.cjs` that:
  1. Detects `@Injectable()` class declarations in new/modified files
  2. Verifies a `@cluster <Domain>/<Subdomain>` JSDoc tag exists
  3. Validates the domain part against the canonical domain list extracted from CANONICAL_DOMAINS.md
- **Sample violation message**:
  ```
  [G3] New @Injectable() class `PaymentAuditService` in backend/src/payments/audit/payment-audit.service.ts
    → Missing @cluster tag. Add JSDoc: /** @cluster Payment/Audit */
    → Valid domains: IdentityAuth, Workspace, Channel, Conversation, Message, Contact,
      Automation, CommercialIntelligence, Marketing, Product, Checkout, Payment, Wallet,
      MarketplaceTreasury, Affiliate, CRM, Analytics, Billing, KYC, Compliance,
      MemberArea, Sites, …
    → See: docs/architecture/CANONICAL_DOMAINS.md
  ```
- **Allowed escape hatch**: `canonicalization-allow: no-cluster-tag-infra` for cross-cutting infrastructure services (AuditService, PrismaService, PulseService — already catalogued in SERVICE_CATALOG.md Phase 0)
- **Implementation status**: ⏳ pending (custom ESLint rule + domain-list extraction)### Gate G4: Duplicate capability

- **Source of truth**: [CAPABILITY_MAP.md](CAPABILITY_MAP.md)
- **What it blocks**:
  - New method whose signature + behavioral shape matches an existing entry in CAPABILITY_MAP.md without declaring "decided alongside <existing>"
  - New Prisma model that duplicates an existing model's responsibility (e.g., a second `Payment`-like model)
- **Concrete check**:
  1. `scripts/ops/check-canonical-duplicates.mjs` — byte-identical function/type duplicate detection (ALREADY ACTIVE)
  2. `tools/canonicalize/scan.mjs` — regenerates CAPABILITY_MAP.md; CI diff scan detects new entries without `decided alongside` annotation
  3. Semantic duplicate detection (future): AST comparison of new method signatures vs CAPABILITY_MAP.md entries; CI emits WARN
- **Sample violation message**:
  ```
  [G4] Potential duplicate capability detected:
    New: `RefundService.createPartialRefund(orderId, amount, reason)` in backend/src/payments/refund/partial-refund.service.ts
    Matches existing: `RefundService.create()` in backend/src/payments/refund/refund.service.ts (CAPABILITY_MAP.md: Process Refund)
    → If intentional, add JSDoc: /** decided alongside `Process Refund` — partial refund variant */
    → If unintentional, reuse the canonical implementation.
  ```
- **Allowed escape hatch**: `canonicalization-allow: decided-alongside-<existing-capability>` with explicit rationale in the JSDoc
- **Implementation status**: ⏳ G4.1 active (byte-identical); G4.2 pending (semantic diff)### Gate G5: Re-import of removed module

- **Source of truth**: [DEPRECATION_MAP.md](DEPRECATION_MAP.md) — every `⛔ banned` and `✅ migrated (re-export)` row
- **What it blocks**:
  - `import { … } from '<banned-path>'` where the canonical replacement exists
  - `import { Asaas } from '…'` — any Asaas reference (ADR 0003)
  - Re-importing from local duplicate sites that have been migrated to re-exports (e.g., importing `clamp` from `kloel/commem/commem.types.ts` instead of `common/math.ts`)
- **Concrete check**: ESLint `no-restricted-imports` in each workspace's `eslint.config.mjs`, fed from a generated JSON allowlist
- **Config file**: `scripts/eslint-rules/restricted-imports.generated.json` — generated by `scripts/ops/check-canonical-duplicates.mjs --emit-eslint` from DEPRECATION_MAP.md
- **Sample violation message**:
  ```
  [G5] Forbidden import: `import { clamp } from '../kloel/commem/commem.types'`
    → Canonical location: `import { clamp } from '../../common/math'`
    → This duplicate was migrated 2026-05-20 (DEPRECATION_MAP.md row 1).
    → See: docs/architecture/DEPRECATION_MAP.md
  ```
- **Allowed escape hatch**: `canonicalization-allow: legacy-import-<symbol>` only for ⏳ planned migrations; NEVER for ⛔ banned paths
- **Implementation status**: ⏳ pending (generated JSON + ESLint wiring)### Gate G6: Workspace isolation bypass

- **Source of truth**: [SERVICE_CATALOG.md](SERVICE_CATALOG.md) (every entry has `workspaceIsolation` field); [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md) §2 (Workspace domain)
- **What it blocks**:
  - Any Prisma query on a workspace-scoped model that lacks `workspaceId` in the `where` clause
  - `findUnique` / `findMany` / `update` / `delete` / `upsert` on models with a `workspaceId` column that omit it from the filter
  - Queries on transitive-dependency models (reachable from workspace-scoped models) that don't carry through the workspace constraint
- **Existing enforcement**:
  1. `scripts/ops/check-tenant-filter.mjs` — static analyzer that parses Prisma schema, classifies models as `directScoped` / `transitive` / `global`, scans `backend/src/**/*.ts` and `worker/**/*.ts` for Prisma calls lacking `workspaceId` filter (ALREADY ACTIVE)
  2. `scripts/ops/tenant-filter-baseline.json` — baseline of known intentional exceptions with `@AllowCrossWorkspace`, `@AdminGlobalOperation`, `@PublicMetric`, or `@CrossWorkspaceMaintenance` markers
- **Concrete check**: `scripts/ops/check-tenant-filter.mjs` (ALREADY ACTIVE in `check-all-gates.mjs`)
- **Sample violation message**:
  ```
  [G6] Workspace isolation bypass in backend/src/contacts/contact.service.ts:87
    → `prisma.contact.findMany({ where: { email } })` — missing workspaceId filter.
    → Model `Contact` is workspace-scoped (direct). Add `workspaceId` to where.
    → If cross-workspace access is intentional, add `// @AllowCrossWorkspace` comment above.
  ```
- **Allowed escape hatch**: `@AllowCrossWorkspace` / `@AdminGlobalOperation` / `@PublicMetric` / `@CrossWorkspaceMaintenance` marker comments (already recognized by the script)
- **Implementation status**: ✅ active### Gate G7: Banned pragma directives

- **Source of truth**: [ratchet.json](../ratchet.json) (mechanical quality floor)
- **What it blocks**:
  - `@ts-ignore` — ratchet `ts_ignore_max: 0`
  - `eslint-disable` — ratchet `eslint_disable_max: 0`
  - `biome-ignore` — ratchet `biome_ignore_max: 0`
  - `nosemgrep` — ratchet `nosemgrep_max: 0`
  - `@ts-expect-error` — ratchet `ts_expect_error_max: 0`
  - `@ts-nocheck` — ratchet `ts_nocheck_max: 0`
  - `codacy:disable` / `codacy:ignore` — ratchet `codacy_disable_max: 0`, `codacy_ignore_max: 0`
  - `NOSONAR` — ratchet `nosonar_max: 0`
  - `noqa` — ratchet `noqa_max: 0`
- **Concrete check**: `scripts/ops/collect-ratchet-metrics.mjs` (ALREADY ACTIVE — counts each directive; ratchet ensures counts never increase above 0)
- **Sample violation message**:
  ```
  [G7] Ratchet violation: `@ts-ignore` count increased from 0 to 1.
    → File: backend/src/payments/new-gateway.service.ts:45
    → Ratchet is a one-way door: suppression directives must never go up.
    → Fix the type error instead of suppressing it.
  ```
- **Allowed escape hatch**: NONE — the ratchet is mechanical, not advisory
- **Implementation status**: ✅ active### Gate G8: New Prisma model without `RAC_` prefix

- **Source of truth**: `backend/prisma/schema.prisma` (existing convention: `RAC_Agent`, `RAC_Contact`, `RAC_Conversation`, `RAC_Message`, `RAC_Product`, `RAC_Subscription`, `RAC_Payment`, etc.)
- **What it blocks**: Any new `model` declaration in `schema.prisma` that does not follow the `RAC_` prefix convention (legacy models without the prefix are grandfathered but new ones NOT)
- **Concrete check**: `scripts/ops/check-prisma-schema-single-source.mjs` (ALREADY EXISTS — extend with model naming check)
- **Sample violation message**:
  ```
  [G8] New Prisma model `InvoiceAudit` in backend/prisma/schema.prisma:1200
    → Missing `RAC_` prefix. Use `RAC_InvoiceAudit`.
    → Rationale: All new models must follow the RAC_ (Rationalized Architecture Canon) prefix
      to distinguish canonicalized models from legacy ones.
  ```
- **Allowed escape hatch**: `canonicalization-allow: no-rac-prefix-<reason>` — only for Prisma-required join tables or enum types
- **Implementation status**: ⏳ pending (extend existing check-prisma-schema script)### Gate G9: No `prisma db push` in production, CI, scripts, or automation

- **Source of truth**: Copilot instructions + production-hardening requirements
- **What it blocks**: Any usage of `prisma db push` outside local development
- **Concrete check**: `scripts/ops/guard-prisma-db-push.mjs` (ALREADY EXISTS)
- **Sample violation message**:
  ```
  [G9] Forbidden: `npx prisma db push` detected in scripts/deploy.sh:12
    → Use `prisma migrate deploy` for production. `db push` can cause data loss.
    → See: docs/adr/0001-use-prisma-migrate.md
  ```
- **Allowed escape hatch**: NONE
- **Implementation status**: ✅ active### Gate G10: Non-canonical event namespace

- **Source of truth**: [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) (Section I — Spine events use `commerce.*`, `cognition.*`, `pulse.*`, `lineage.*`; Section II — Brain events use unprefixed names)
- **What it blocks**:
  - Spine `.emit()` calls using namespaces not in the canonical set (`commerce`, `cognition`, `pulse`, `lineage`)
  - Brain events using dot-prefixed names (they MUST be unprefixed)
  - Hybrid or legacy namespace usage (e.g., `mercado_entrada` → must use `commerce.onboarding`)
- **Concrete check**: `scripts/ops/check-canonical-events.mjs` (ALREADY ACTIVE — validates against the canonical form regex and registered set)
- **Sample violation message**:
  ```
  [G10] Non-canonical event namespace `mercado_entrada.declared` in backend/src/kloel/mercado-entrada.declarator.service.ts:268
    → This namespace was canonicalized to `commerce.onboarding` (see DEPRECATION_MAP.md row `mercado_entrada.declared`)
    → Use: `commerce.onboarding.declared`
  ```
- **Allowed escape hatch**: NONE — event names must be canonical
- **Implementation status**: ✅ active### Gate G11: File size ceiling

- **Source of truth**: [ratchet.json](../ratchet.json) (`files_over_800_lines_max: 1`)
- **What it blocks**: New source files exceeding 800 lines; existing files over 800 lines growing further
- **Concrete check**: `scripts/ops/collect-ratchet-metrics.mjs` (ALREADY ACTIVE — counts files over 800 lines)
- **Sample violation message**:
  ```
  [G11] Ratchet violation: `files_over_800_lines` increased from 1 to 2.
    → New over-800-line file: backend/src/kloel/new-god-service.ts (892 lines)
    → Decompose into focused sub-services. See WAVE2_FILE_SIZE_AUDIT.md for patterns.
  ```
- **Allowed escape hatch**: `canonicalization-allow: large-file-<reason>` — requires explicit justification in PR description
- **Implementation status**: ✅ active### Gate G12: Webhook signature verification bypass

- **Source of truth**: [WAVE1_WEBHOOK_SECURITY_AUDIT.md](audits/WAVE1_WEBHOOK_SECURITY_AUDIT.md) (15 Grade A, 5 Grade B endpoints)
- **What it blocks**:
  - New webhook controller that does not verify provider signatures or tokens
  - Removal of existing signature verification from webhook controllers
- **Concrete check**: `scripts/ops/check-security.mjs` (ALREADY EXISTS — extend with webhook signature verification detection)
- **Sample violation message**:
  ```
  [G12] New webhook endpoint `POST /webhooks/new-provider` in backend/src/webhooks/new-provider.controller.ts
    → Missing signature verification. All webhook endpoints MUST verify provider signatures.
    → Pattern: See MercadoPagoWebhookController (HMAC) or StripeWebhookController (stripe-signature).
    → See: docs/audits/WAVE1_WEBHOOK_SECURITY_AUDIT.md
  ```
- **Allowed escape hatch**: NONE — security gate
- **Implementation status**: ⏳ pending (extend check-security.mjs)### Gate G13: Math.random in production code

- **Source of truth**: [WAVE2_MATH_RANDOM_AUDIT.md](audits/WAVE2_MATH_RANDOM_AUDIT.md) (all 12 prod sites fixed; 0 remaining)
- **What it blocks**: Any new `Math.random()` usage outside test files (`.spec.ts`, `.test.ts`)
- **Concrete check**: ESLint `no-restricted-properties` for `Math.random` in `backend/src/**/*.ts`, `worker/**/*.ts` (excluding `*.spec.ts`)
- **Config location**: Add to each workspace's `eslint.config.mjs`:
  ```js
  { files: ['src/**/*.ts'], excludedFiles: ['**/*.spec.ts', '**/*.test.ts'],
    rules: { 'no-restricted-properties': ['error',
      { object: 'Math', property: 'random',
        message: 'Use crypto.randomBytes-backed helpers from common/random-id.ts' }] } }
  ```
- **Sample violation message**:
  ```
  [G13] `Math.random()` in backend/src/payments/new-feature.service.ts:67
    → Use `randomIdSegment()` from `common/random-id.ts` (crypto.randomBytes-backed).
    → Math.random() is not cryptographically secure and produces predictable IDs.
  ```
- **Allowed escape hatch**: NONE
- **Implementation status**: ⏳ pending (ESLint rule addition)### Gate G14: Heavy business logic in controller

- **Source of truth**: Copilot instructions — controllers MUST delegate to services
- **What it blocks**: Controller methods with > 20 lines of non-delegation logic (validated by AST analysis)
- **Concrete check**: `scripts/ops/check-architecture-guardrails.mjs` (ALREADY EXISTS — extend with controller-body-length check)
- **Sample violation message**:
  ```
  [G14] Controller `PaymentController.processRefund()` in backend/src/payments/payment.controller.ts:45-78
    → Contains 34 lines of business logic inline. Controllers must delegate to services.
    → Extract to `RefundService.processRefund()` and call from controller.
  ```
- **Allowed escape hatch**: `canonicalization-allow: controller-logic-<reason>` — only for response formatting/validation (not business rules)
- **Implementation status**: ⏳ pending (extend existing guardrails script)### Gate G15: Fake data or hardcoded metrics in UI

- **Source of truth**: Copilot instructions — no `Math.random()`, hardcoded metrics, or false success states in UI
- **What it blocks**:
  - `Math.random()` used to generate display data in frontend components
  - Hardcoded numeric metrics (e.g., `revenue: 12345`) in UI pages
  - Placeholder success states that don't reflect actual API results
- **Concrete check**: ESLint `no-restricted-syntax` in `frontend/eslint.config.mjs` + regex scan in `scripts/ops/check-architecture-guardrails.mjs`
- **Sample violation message**:
  ```
  [G15] Hardcoded metric `totalRevenue = 50000` in frontend/src/app/(main)/dashboard/page.tsx:34
    → Metrics must come from API data. Hardcoded values create false confidence.
    → Use useSWR or server-side data fetching to retrieve real metrics.
  ```
- **Allowed escape hatch**: NONE — production UI must show real data
- **Implementation status**: ⏳ pending

---

## Existing infrastructure

The following checks are **already running** in `check-all-gates.mjs` and/or pre-push:

| Check | Script | Gates covered | Active since |
|---|---|---|---|
| Event taxonomy validation | `scripts/ops/check-canonical-events.mjs` | G2, G10 | 2026-05-21 |
| Byte-identical duplicate detection | `scripts/ops/check-canonical-duplicates.mjs` | G1.2, G4.1 | 2026-05-21 |
| Tenant filter enforcement | `scripts/ops/check-tenant-filter.mjs` | G6 | pre-Wave 6 |
| Pragma directive ratchet | `scripts/ops/collect-ratchet-metrics.mjs` | G7 | 2026-05-17 |
| File size ratchet | `scripts/ops/collect-ratchet-metrics.mjs` | G11 | 2026-05-17 |
| Prisma db push guard | `scripts/ops/guard-prisma-db-push.mjs` | G9 | pre-Wave 6 |
| Architecture guardrails | `scripts/ops/check-architecture-guardrails.mjs` | G14 (partial) | pre-Wave 6 |
| Security scan | `scripts/ops/check-security.mjs` | G12 (partial) | pre-Wave 6 |
| AI constitution | `scripts/ops/check-ai-constitution.mjs` | — | pre-Wave 6 |
| Governance boundary | `scripts/ops/check-governance-boundary.mjs` | — | pre-Wave 6 |
| Visual contract | `scripts/ops/check-visual-contract.mjs` | — | pre-Wave 6 |
| Test integrity | `scripts/ops/check-test-integrity.mjs` | — | pre-Wave 6 |
| Unsafe casts | `scripts/ops/check-unsafe-casts.mjs` | — | pre-Wave 6 |
| Unsafe queries | `scripts/ops/check-unsafe-queries.mjs` | — | pre-Wave 6 |
| Layer boundaries | `scripts/ops/check-layer-boundaries.mjs` | — | pre-Wave 6 |
| Model strings | `scripts/ops/check-model-strings.mjs` | — | pre-Wave 6 |
| Code quality | `scripts/ops/check-code-quality.mjs` | — | pre-Wave 6 |
| Data integrity | `scripts/ops/check-data-integrity.mjs` | — | pre-Wave 6 |
| Admin token parity | `scripts/ops/check-admin-token-parity.mjs` | — | pre-Wave 6 |
| Codacy skip tags | `scripts/ops/check-codacy-skip-tags.mjs` | — | pre-Wave 6 |
| Changed ESLint config | `guard:changed-eslint` | — | pre-Wave 6 |---

## Implementation order

Each PR activates one or two gates, starting with those that have the lowest
false-positive risk and the most existing infrastructure:

| PR | Gates | Work | Risk |
|---|---|---|---|
| **PR-0** | — | Merge this file (`ANTI_REGRESSION_GATES.md`) + gate registry skeleton | None (docs only) |
| **PR-1** | G13, G5 | Add ESLint `no-restricted-properties` for `Math.random` + ESLint `no-restricted-imports` generated from DEPRECATION_MAP | Low (mechanical, already zero prod usage) |
| **PR-2** | G1.3 | Custom ESLint rule `no-banned-aliases.cjs` for banned event name literals | Low (event names are well-catalogued) |
| **PR-3** | G2, G10 | Extend `check-canonical-events.mjs` to scan `Queue.add()` + gateway `emit()` patterns | Low (adds scan passes to existing script) |
| **PR-4** | G3 | Custom ESLint rule `require-cluster-tag.cjs` for new `@Injectable()` classes | Medium (new rule; needs domain-list extraction from CANONICAL_DOMAINS.md) |
| **PR-5** | G8 | Extend `check-prisma-schema-single-source.mjs` with `RAC_` prefix check | Low (regex on schema.prisma) |
| **PR-6** | G12 | Extend `check-security.mjs` with webhook signature verification detection | Medium (needs AST-level webhook path detection) |
| **PR-7** | G15 | Add ESLint `no-restricted-syntax` for hardcoded metrics + `Math.random` in frontend | Medium (needs pattern refinement to avoid false positives) |
| **PR-8** | G4.2, G14 | Semantic duplicate detection + controller body-length check in `check-architecture-guardrails.mjs` | High (semantic comparison is complex; start with signature matching) |---

## Operator notes

### Escape hatch

Every gate recognizes a per-file escape hatch comment:

```ts
// canonicalization-allow: <reason>
```

The comment MUST appear on the line immediately above the violation. Valid
reasons are enumerated per gate above. A PR with an escape hatch MUST have
signed code review from a second developer. The CI job flags escape hatches
without approval in the PR metadata.

### Run locations

- **Pre-push** (husky `pre-push`): Fast checks only — G1, G2, G5, G6, G7, G9, G13
- **CI** (`scripts/ops/check-all-gates.mjs`): Full suite — all gates + typecheck + tests
- **Nightly** (scheduled): Deep scans — G4.2 (semantic dups), G8 (full schema audit)

### SARIF output

All Node scripts under `scripts/ops/` MUST emit findings in SARIF-compatible
JSON to `stdout` when `--format sarif` is passed. The `scripts/ops/emit-findings-sidecars.mjs`
collector merges individual SARIF outputs into a single file that Codacy and
the Code Review pipeline consume for inline annotations.

Current SARIF support: `check-canonical-events.mjs` (via `emit-findings-sidecars`),
`check-tenant-filter.mjs` (via `emit-findings-sidecars`).
Remaining scripts need `--format sarif` support added (tracked in PR-3, PR-4, PR-6).

### Adding a new gate

1. Define the gate in this file (G16, G17, …)
2. Create or extend the check script under `scripts/ops/`
3. Add the script to `scripts/ops/check-all-gates.mjs` `steps` array
4. Add SARIF output support
5. Add ratchet metric if the gate is countable
6. Update the implementation status table above

### Protected files

The following files MUST NOT be edited by automation or the PI subagent:
- `backend/eslint.config.mjs`
- `frontend/eslint.config.mjs`
- `worker/eslint.config.mjs`
- `frontend-admin/eslint.config.mjs`
- `.codacy.yml`
- `package.json`
- `.github/workflows/**`
- `docs/codacy/**`
- `.husky/pre-push`

Gate configuration files that modify ESLint behavior go under
`scripts/eslint-rules/` as standalone configs or custom rule modules.
The human operator merges these into the protected `eslint.config.mjs` files.---

## Related

- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md)
- [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md)
- [CAPABILITY_MAP.md](CAPABILITY_MAP.md)
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md)
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md)
- [DEPRECATION_MAP.md](DEPRECATION_MAP.md)
- [ratchet.json](../ratchet.json)
- [WAVE1_PRISMAANY_AUDIT.md](audits/WAVE1_PRISMAANY_AUDIT.md)
- [WAVE1_WEBHOOK_SECURITY_AUDIT.md](audits/WAVE1_WEBHOOK_SECURITY_AUDIT.md)
- [WAVE2_MATH_RANDOM_AUDIT.md](audits/WAVE2_MATH_RANDOM_AUDIT.md)
- [WAVE2_FILE_SIZE_AUDIT.md](audits/WAVE2_FILE_SIZE_AUDIT.md)
- [WAVE3_DEAD_HANDLERS.md](audits/WAVE3_DEAD_HANDLERS.md)
- [WAVE3_EMPTY_RETURNS.md](audits/WAVE3_EMPTY_RETURNS.md)
- [`scripts/ops/check-all-gates.mjs`](../scripts/ops/check-all-gates.mjs) — gate orchestrator
- [`scripts/ops/check-canonical-events.mjs`](../scripts/ops/check-canonical-events.mjs) — G2+G10 implementation
- [`scripts/ops/check-canonical-duplicates.mjs`](../scripts/ops/check-canonical-duplicates.mjs) — G1.2+G4.1 implementation
- [`scripts/ops/check-tenant-filter.mjs`](../scripts/ops/check-tenant-filter.mjs) — G6 implementation
- [`scripts/ops/guard-prisma-db-push.mjs`](../scripts/ops/guard-prisma-db-push.mjs) — G9 implementation

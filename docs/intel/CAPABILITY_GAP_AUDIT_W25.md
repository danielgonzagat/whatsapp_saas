# Capability Gap Audit — Wave 25

**Generated:** 2026-05-26 (session resume after PC power-off)
**Branch:** `feat/kloel-cognitive-organism`
**HEAD:** `b0b742fe7` (registry +8 caps)
**Mission ref:** Kloel cognitive organism + commercial autonomy (full prompt
in conversation context).

## Audit headline

- **Registry size:** 136 capabilities declared in
  `backend/src/kloel/capability-registry-v2/capability-registry-v2.const.ts`
- **Dispatcher cases:** 134 in `kloel-tool-dispatcher.service.ts`
- **Caps with no dispatcher case (FALA_MAS_NAO_EXECUTA):** **30**
- **Caps with dispatcher case but no domain service:** ~5 (estimate)
- **Caps with `prisma.*` direct path (anti-pattern 2.2):** TBD by audit PI

## Unwired caps — by priority tier

### Critical (payments / commerce)

| Cap ID                | Domain Service             | Status   | Priority |
| --------------------- | -------------------------- | -------- | -------- |
| `sales.create_pix`    | `SmartPaymentService.createSmartPayment` or `PaymentService.generatePix` | service exists | P0 |
| `sales.create_boleto` | same                       | service exists | P0 |
| `sales.list`          | `OrderService` (find) or wallet helpers | partial | P0 |
| `wallet.balance`      | `WalletService.getBalance` | service exists | P0 |
| `wallet.withdraw`     | `WalletService.requestWithdrawal` | service exists | P0 |

### High (products / plans / checkouts / coupons)

| Cap ID                  | Domain Service          | Status   | Priority |
| ----------------------- | ----------------------- | -------- | -------- |
| `products.create`       | `ProductService.create` | service exists | P1 |
| `products.update`       | `ProductService.update` | service exists | P1 |
| `products.upload_image` | `MediaService` / `ProductService.setImage` | TBD | P1 |
| `plans.create`          | `PlanService.create`    | service exists | P1 |
| `plans.update`          | `PlanService.update`    | service exists | P1 |
| `checkouts.create`      | `CheckoutService.create`| service exists | P1 |
| `checkouts.update`      | `CheckoutService.update`| service exists | P1 |
| `coupons.create`        | `CouponService.create`  | service exists | P1 |
| `coupons.delete`        | `CouponService.delete`  | service exists | P1 |

Note: registry has **two synonyms** for some caps — `coupons.create` AND
`create_coupon` (without dotted prefix). The non-dotted form is wired; the
dotted form is not. PI must add aliases in the dispatcher, NOT new code paths.

### Medium (account / urls / affiliates)

| Cap ID                     | Domain Service                    | Status   | Priority |
| -------------------------- | --------------------------------- | -------- | -------- |
| `account.upload_document`  | `AccountService.uploadDocument` (may need create) | partial | P2 |
| `account.update_fiscal`    | `AccountService.updateFiscal`     | service exists | P2 |
| `account.update_bank`      | `AccountService.updateBank`       | service exists | P2 |
| `account.set_pix_key`      | `AccountService.setPixKey`        | wired as `set_pix_key`, missing dotted alias | P2 |
| `update_personal_data`     | `AccountService.updatePersonal`   | wired as some alias, audit | P2 |
| `urls.add`                 | `ProductService.addUrl`           | service may need extension | P2 |
| `affiliates.configure`     | `AffiliateService.configure`      | service exists | P2 |
| `ui.theme`                 | `KloelMemoryService.upsertTheme`  | wired in legacy detector, dotted alias missing | P2 |

### Self-awareness (cognitive organism Tier 0)

| Cap ID            | Domain Service                            | Status     | Priority |
| ----------------- | ----------------------------------------- | ---------- | -------- |
| `self.audit_log`  | needs new helper over `AuditLog` model    | NEW WORK   | P1 |
| `self.explain`    | helper composing Receipt history          | NEW WORK   | P1 |
| `self.gaps`       | helper diffing registry vs dispatcher (this very audit) | NEW WORK | P1 |
| `self.health`     | `HealthService.snapshot` aggregating Redis/DB/integrations | partial — split across modules | P1 |

### Reports (AUSENTE — service doesn't exist)

| Cap ID                  | Domain Service        | Status         | Priority |
| ----------------------- | --------------------- | -------------- | -------- |
| `reports.operations`    | `ReportService.operations` | **AUSENTE** | P1 |
| `reports.abandonments`  | `ReportService.abandonments` | **AUSENTE** | P1 |
| `crm.pipeline`          | `KloelToolExecutorCrm.pipeline` | partial — service exists, wiring missing | P1 |

## Mission tier coverage (per master prompt)

| Mission Tier (from prompt) | Registry coverage | Dispatcher coverage | Status |
| -------------------------- | ----------------- | ------------------- | ------ |
| Tier 0 — Auto-consciência  | 7 caps (`self.*`) + `list_source_dir` | partial (3 of 8) | PARCIAL |
| Tier 1 — Produtos criar    | 10 caps (`products.*` + sub-resources) | partial — create/update unwired | FALA_MAS_NAO_EXECUTA |
| Tier 2 — Produtos editar   | covered by Tier 1 + sub-resources | same | FALA_MAS_NAO_EXECUTA |
| Tier 3 — Marketplace       | TBD — needs audit                 | TBD                 | TBD |
| Tier 4 — Vendas reais      | 3 caps (PIX/Boleto/Card) | unwired (CRITICAL) | FALA_MAS_NAO_EXECUTA |
| Tier 5 — Marketing canais  | WhatsApp +5 (added W25), email/IG/FB unmapped | partial | PARCIAL |
| Tier 6 — Gestão            | sales.list / subs / crm.pipeline declared | unwired | FALA_MAS_NAO_EXECUTA |
| Tier 7 — Compras (buyer)   | same as Tier 4                    | unwired             | FALA_MAS_NAO_EXECUTA |
| Tier 8 — Configurações conta | account.* (4-5 caps)            | partial (1 wired)   | PARCIAL |

## Pre-existing typecheck debt

`backend && npx tsc --noEmit` reports **26 errors** on HEAD (b0b742fe7).
Concentrated in:

- `src/kloel/self-awareness/code-access.service.ts` (5 errors — array access on possibly-undefined)
- `src/kloel/toolplanner/toolplanner.service.ts` (1 — evidenceUrl optional)
- `src/kloel/unified-agent.service.ts` (1 — optional DI params)
- `src/kloel/wisdom/wisdom-relevance-filter.service.ts` (1)
- `src/kloel/operation-receipt.helpers.ts` (1)
- `src/kloel/mind-policy.wisdom-prior.helpers.ts` (1)
- `src/kloel/capability-registry-v2/capability-registry-v2.{const,service}.ts` (4 — same possibly-undefined pattern)
- Other 12 scattered

All are `exactOptionalPropertyTypes: true` violations. Fix pattern:

```ts
// Wrong (under exactOptionalPropertyTypes)
const x: { foo?: string } = { foo: maybeUndefined };

// Right
const x: { foo?: string } = maybeUndefined === undefined ? {} : { foo: maybeUndefined };
// OR change the type to: { foo?: string | undefined }
```

**Backlog ticket:** fix 26 typecheck errors before next merge to homolog —
prior session was building with `--noEmit` skipped. Assigned: separate wave.

## Wave 25 dispatch plan

6 PI subagents in 2 batches of 3 (concurrency cap = 6 per CLAUDE.md PI rules):

**Batch A (parallel):**

1. **w25-wire-payments** — wire `sales.create_pix`, `sales.create_boleto`,
   `sales.list` dispatcher cases → `SmartPaymentService` / `WalletService`.
   Tools: read, search, find, grep, ast_grep, atomic_do, splice, ast_plan.
   Editable: `backend/src/kloel/kloel-tool-dispatcher.service.ts` only.

2. **w25-wire-products-plans-checkouts** — wire 9 product/plan/checkout/coupon
   caps to existing `ProductService` / `PlanService` / `CheckoutService` /
   `CouponService`. Add dotted-alias resolution so `products.create` resolves
   same as `create_product` without code duplication. Editable: dispatcher
   only.

3. **w25-self-awareness-meta** — implement `self.audit_log`, `self.explain`,
   `self.gaps`, `self.health` dispatcher cases. `self.gaps` runs this very
   audit (diff registry vs dispatcher) and returns markdown — first true
   meta-cognition cap. Editable: dispatcher + small helper in
   `self-awareness/`.

**Batch B (after Batch A integrates):**

4. **w25-account-wire** — wire account.* dotted aliases (`account.update_fiscal`,
   `account.update_bank`, `account.set_pix_key`, `account.upload_document`).
   `upload_document` may need new `AccountService.uploadDocument` if not
   present — investigate first.

5. **w25-reports-skeleton** — create `ReportService` (new) with `operations()`
   and `abandonments()` methods over real Prisma queries (read-only,
   workspace-scoped); wire `reports.operations` and `reports.abandonments`
   + `crm.pipeline`. Editable: new service + dispatcher.

6. **w25-e2e-spec-rewrite** — rewrite the deleted `guest-chat.e2e.spec.ts`
   with proper NestJS DI: import all required class tokens (not strings),
   stub minimal viable mocks per provider, prove 8+ chat-to-execution paths.
   Editable: new spec file only.

## Definition-of-done per PI

Each PI delivery is HARDENED by orchestrator after `EXIT` per
`scripts/decomp/PI-subagent-delegation-rules.md` §7:

1. Read every file modified (line-by-line).
2. Run `cd backend && npx tsc --noEmit` on affected files (delta ≤ 0).
3. Run closest spec via `npx jest <path>`.
4. Verify dispatcher case calls **only the domain service** (no Prisma direct).
5. Verify Receipt-shaped return: `{ success, capabilityId, outputs, evidenceUrl }`.
6. Commit as single focused `feat(kloel): <scope>` with co-author trailer
   naming the PI id.
7. Update `docs/intel/CAPABILITY_STATUS.md` (Wave 25 column).

## What this audit does NOT cover (out of scope for W25)

- IntentRouter pattern coverage (separate audit — needs reading all patterns
  vs registry).
- Frontend dashboard-chat → backend wire (frontend out of scope for cognitive
  organism PIs per `scripts/decomp/cognitive-organism-subagent-delegation-rules.md` §2.2).
- Real Kloel-chat validation (task #5 — after wave 25 ships).
- Frontend visual contract (forbidden territory for these PIs).
- Schema migrations (escalate to human).

## References

- `docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md` (canonical mission)
- `docs/contracts/pci/MANIFEST.md` (PCI manifest)
- `scripts/decomp/PI-subagent-delegation-rules.md` (PI orchestration)
- `scripts/decomp/cognitive-organism-subagent-delegation-rules.md` (mission rules)
- `CLAUDE.md` §STRIPE PAYMENT BASELINE (for sales.* path — read before
  touching payment code)

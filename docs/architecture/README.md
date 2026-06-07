# Kloel Canonical Architecture — Index

> Source of truth for the Kloel canonicalization mission. These docs describe what
> the codebase **is** today and which duplications must collapse to **one canonical
> surface per concept**. Grounded against `backend/prisma/schema.prisma` (179 models,
> 41 enums) and `backend/src` at commit `bfba7cced`.

## The 7 canonical docs

| # | Doc | One-line description |
|---|---|---|
| 1 | [CANONICAL_DOMAINS.md](./CANONICAL_DOMAINS.md) | Every top-level module (domain) with file/service/controller/event counts — the size map of the system (186 domain rows, 622 services). |
| 2 | [CANONICAL_VOCABULARY.md](./CANONICAL_VOCABULARY.md) | Canonical entity/symbol name → forbidden aliases. The rename dictionary a codemod can read. **Starter only — see caveats below.** |
| 3 | [CAPABILITY_MAP.md](./CAPABILITY_MAP.md) | Functional capabilities (e.g. `send_message`, `resolve_tenant`) and every implementation found; any capability with >1 impl is a canonicalization candidate. |
| 4 | [EVENT_TAXONOMY.md](./EVENT_TAXONOMY.md) | Every `.emit/.on` and Spine `eventName` string (106 events) cross-checked against the PCI.6 `EVENT_TO_TRANSITION` catalog; naming variants flagged. |
| 5 | [SERVICE_CATALOG.md](./SERVICE_CATALOG.md) | Every `@Injectable()` class with its domain assignment (622 services). The "one service per responsibility" worklist. |
| 6 | [DUPLICATION_REGISTER.md](./DUPLICATION_REGISTER.md) | Symbols exported from multiple files (340 cross-file duplicates) + a hand-maintained "Converged duplications" table for behavioural (non-name) collapses. |
| 7 | [DEPRECATION_MAP.md](./DEPRECATION_MAP.md) | Each deprecated symbol/access-pattern, its canonical replacement, and the CI gate (`check:canonical-mind`) or convention that enforces it. |

### Supporting inventories (per-cluster, deeply grounded)

The richest duplication evidence is **not** in the 7 summary docs — it is in
[`inventory/*.json`](./inventory/), seven cluster files each carrying
`canonicalEntities`, `services`, `capabilities`, and **severity-tagged `duplications`**
(P0/P1/P2/P3) with `schema:line` and `file.ts:line` refs:

- `channels-omnicore.json` · `checkout-payment-wallet.json` · `contact-crm.json`
- `conversation-message.json` · `identity-auth.json` · `kloel-mind-core.json`
- `product-plan-offer.json`

Companion catalogs: [ROUTES_CATALOG.md](./ROUTES_CATALOG.md) (925 routes),
[QUEUES_CATALOG.md](./QUEUES_CATALOG.md) (17 BullMQ queues),
[PRISMA_USAGE.md](./PRISMA_USAGE.md) (delegate → 174/179 models, file index),
and the deep-dive canonicals: `MIND_SERVICES_CANONICAL.md`, `SEND_MESSAGE_CANONICAL.md`,
`CHANNEL_DISPATCH_CANONICAL.md`, `CONNECT_CHANNEL_CANONICAL.md`.

## How to use this

1. **Picking what to canonicalize next?** Read the inventory `duplications` arrays
   first (filter `severity === "P0"`), not the summary docs — the P0s carry the
   bug-bearing divergences with exact line refs.
2. **Renaming a symbol?** Add the canonical→aliases row to `CANONICAL_VOCABULARY.md`,
   then drive the rename with `mcp__atomic-edit__atomic_rename_symbol_cross_file`.
3. **Deprecating an access path?** Add a row to `DEPRECATION_MAP.md` AND wire a gate
   under `scripts/ops/check-canonical-*.mjs` so the duplication cannot re-grow.
4. **Regenerate the auto sections** after big merges: `node tools/canonicalize/scan.mjs`.
   (`CANONICAL_DOMAINS`, `CAPABILITY_MAP`, `EVENT_TAXONOMY`, `SERVICE_CATALOG`,
   `DUPLICATION_REGISTER`, `ROUTES/QUEUES/PRISMA_USAGE` are generated; the
   inventory JSONs, `CANONICAL_VOCABULARY`, and `DEPRECATION_MAP` are hand-curated.)

## Canonicalization status (grounded snapshot)

**Converged + gate-locked (cannot re-grow):**
- `prisma.kloelMemory.*` → `MindMemoryItemService.items`; `prisma.kloelMessage.*` →
  `MindMessageService.items`; `prisma.chatMessage.*` → `MindChatMessageService.items`
  (all under `backend/src/kloel/mind/aliases/`, enforced by `check:canonical-mind`).
- Non-validating `getWorkspaceId` → validating `resolveWorkspaceId` across the 9
  product-sub-resource controllers (commit `d8504661d`).
- Channel send path: `ChannelTransportRegistry.send` delegates to canonical
  `ChannelMessageDispatchService` behind `KLOEL_TRANSPORT_CANONICAL_DELEGATE` (default OFF).

**In flight (documented here, not yet collapsed):**
- `KloelMemory` (`RAC_KloelMemory`, canonical store) → `MindMemory` (`RAC_MindMemory`,
  shadow) **dual-write** gated by `KLOEL_MINDMEMORY_DUALWRITE` (default OFF) —
  `mind-memory-item.service.ts:96`. The migration's existence is currently invisible
  in `DEPRECATION_MAP.md`.

**Open P0s (collapse next — see inventory refs):**
1. Logout blacklist writes `access-token-revoked:<jti>` (`auth.service.ts:329`) but the
   guard reads `jti:revoked:<jti>` (`jwt-auth.guard.ts:92`) — revoked access tokens
   still pass.
2. Tenant resolver forks into 4 divergent security semantics
   (`workspace-access.ts:119` secure vs `kloel-security.guard.ts:45` JWT-ignoring vs
   `common.helpers.ts:20` empty-string vs `route-class.guard.ts:25` header-trusting).
3. Phone normalization diverges across Contact-keying paths (BR-promote vs digits-only
   vs raw); `KloelLeadProcessorService.processWhatsAppMessageWithPayment` looks up
   `kloelLead` by RAW `senderPhone` (`kloel-lead-processor.service.ts:285`) though the
   lead was created under a normalized phone.
4. Sale/Order/Payment focal record split 4 ways (`KloelSale` 1917 / `CheckoutOrder` 3220
   / `CheckoutPayment` 3330 / `Payment` 2744).
5. Plan pricing split: `ProductPlan.price` (Float) vs `CheckoutProductPlan.priceInCents`
   (Int); coupon split `ProductCoupon` vs `CheckoutCoupon`.
6. Cognitive loop implemented 3+ times with divergent storage (`MindService.tick`,
   `MindPredictionService.runCycle`, `MindBackgroundProcessor.tick`).

**Known doc gaps (this index flags them; the docs don't yet):**
- `OpsEvent` and `RiscEvent` models appear in NO architecture doc despite being live
  (`observability/ops-alert.service.ts`, `compliance.service.ts`).
- 52 of 179 models are absent from every `inventory/*.json` (advertising `AdAccount`/
  `AdCampaign`/`AdInsight`/`AdSpend`/`AdRule`, flows `Flow*`, knowledge `KnowledgeBase`/
  `KnowledgeSource`/`Vector`, sites `Site`/`SiteDomain`/`KloelSite`/`KloelDesign`,
  email `EmailCampaign*`, voice `VoiceJob`/`VoiceProfile`, autonomy `AutonomyRun`/
  `AutonomyExecution`/`DecisionShadow`/`DecisionOutcome*`, `Webinar`, `FollowUp`, …) —
  they are file-indexed in `PRISMA_USAGE.md` but never assigned a canonical domain or
  duplication verdict.
- `CANONICAL_VOCABULARY.md` lists `ChannelSession` as the flagship canonical entity,
  but no such Prisma model or TS symbol exists; and it reduces `Lead` to a label-alias
  of `Contact` while `KloelLead` (`RAC_KloelLead`) is a separate live table. Treat both
  rows as aspirational targets, not current reality.

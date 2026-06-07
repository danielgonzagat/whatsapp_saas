# Kloel Canonical Architecture — Index

> Source of truth for the Kloel canonicalization mission. These docs describe what the
> codebase **is** today and which duplications must collapse to **one canonical surface
> per concept**. Every model/service/file name is grep/AST-verified against
> `backend/prisma/schema.prisma` (**179 models**), `backend/src/**`, and the separate
> `worker/**` deployable (**~930K LOC** of TypeScript). No invented names.
>
> **Last validated:** 2026-06-07.

## The 7 canonical docs

| # | Doc | One-line description |
|---|---|---|
| 1 | [CANONICAL_DOMAINS.md](./CANONICAL_DOMAINS.md) | The 9 bounded contexts (domains): what each owns, what it `mustNotOwn`, its upstream/downstream, and the backend modules that implement it. |
| 2 | [CANONICAL_VOCABULARY.md](./CANONICAL_VOCABULARY.md) | One official term per concept → its real backing model/service + the FORBIDDEN aliases that route data to the wrong store. The PR/ADR tiebreaker. |
| 3 | [CAPABILITY_MAP.md](./CAPABILITY_MAP.md) | Per capability (named by verb), the ONE canonical implementation to call + every duplicate that must migrate onto it + the migration state. |
| 4 | [EVENT_TAXONOMY.md](./EVENT_TAXONOMY.md) | The dotted `<domain>.<entity>.<verb>` event catalog grounded in the two in-source registries (`mind-event-taxonomy.ts`, `event-taxonomy.canonical-aliases.ts`) + the 5 event sinks. |
| 5 | [SERVICE_CATALOG.md](./SERVICE_CATALOG.md) | Which `@Injectable` service owns each capability (responsibility / must-not-do / backing models / deps) + the services that duplicate a responsibility and must converge. |
| 6 | [DUPLICATION_REGISTER.md](./DUPLICATION_REGISTER.md) | The exhaustive, severity-tagged register of every structural duplication (**55 entries: 8 P0 · 25 P1 · 17 P2 · 5 P3**), each with file:line refs, canonical choice, and migration sketch. |
| 7 | [DEPRECATION_MAP.md](./DEPRECATION_MAP.md) | Per canonical surface: KEPT / MIGRATED / DEPRECATED / MID-MIGRATION verdict, the evidence-of-non-use deletion bar, and the 9 in-flight migrations that are NOT yet converged. |

### Supporting catalogs (grounded, not part of the core 7)

`ARCHITECTURE_INDEX.md`, `ROUTES_CATALOG.md`, `QUEUES_CATALOG.md`, `PRISMA_USAGE.md`,
and the deep-dive canonicals `MIND_SERVICES_CANONICAL.md`, `SEND_MESSAGE_CANONICAL.md`,
`CHANNEL_DISPATCH_CANONICAL.md`, `CONNECT_CHANNEL_CANONICAL.md`. Per-cluster evidence
lives in [`inventory/*.json`](./inventory/) (consolidated into `inventory/_CONSOLIDATED.json`,
the digest these 7 docs are generated from).

## How to use this

1. **Placing a new model/field/service?** Find the owning domain in `CANONICAL_DOMAINS.md`,
   confirm no other domain lists it under `mustNotOwn`, then check `CANONICAL_VOCABULARY.md`
   so you don't re-introduce a forbidden alias.
2. **"Where does X actually happen, and which copy is real?"** → `CAPABILITY_MAP.md` (by verb)
   or `SERVICE_CATALOG.md` (by owning service).
3. **Picking what to canonicalize next?** → `DUPLICATION_REGISTER.md`, filter to **P0** first —
   those carry the live revenue/identity/security defects with exact line refs.
4. **Emitting a new event?** → `EVENT_TAXONOMY.md` §"quick canonicalization recipe"; add the
   canonical name to `BRAIN_EVENT_TAXONOMY` first so the type system accepts it.
5. **Can I delete this?** → `DEPRECATION_MAP.md`: a surface is only droppable once its
   evidence-of-non-use bar comes back empty; do NOT delete a MID-MIGRATION legacy surface
   or flip a dual-write flag ON before its reader path lands.
6. **Renaming a symbol?** Drive it with `mcp__atomic-edit__atomic_rename_symbol_cross_file`
   using the canonical→aliases rows in `CANONICAL_VOCABULARY.md`.

## Five corrections baked into every doc (do NOT regress)

These were wrong in the v1 docs and are corrected throughout. They are the load-bearing
facts most likely to be re-introduced by a careless edit:

1. **`ChannelSession` is FICTIONAL** — zero grep matches in `backend/src/**` and
   `schema.prisma`. The real channel-session surface is `WhatsappSessionService`
   (`marketing/channels/whatsapp/whatsapp-session.service.ts:19`) over `ChannelSetup`
   (schema:3492) + `MetaConnection` (schema:3467).
2. **`Lead` is NOT an alias of `Contact`.** `KloelLead` (`RAC_KloelLead`, schema:1834) is a
   distinct LIVE table — an **open P1 MERGE DECISION** vs `Contact` (`RAC_Contact`,
   schema:399), bridged by `Contact.kloelLeadId` (schema:444) + best-effort dual-write in
   the 3 lead services + `person-kloel-lead-to-contact.backfill.*` (there is **no dedicated
   flag file** for this migration).
3. **`OpsEvent` (schema:1614) and `RiscEvent` (schema:1273) are LIVE models** — `OpsEvent` ←
   `OpsAlertService`; `RiscEvent` ← `ComplianceService.routeRiscEvent`, which IS the
   processor, not an ingest-only stub.
4. **`campaign-jobs` / `voice-jobs` / `media-jobs` are NOT dead queues** — they have live
   workers in the separate `worker/` deployable (`campaign-processor.ts:147`,
   `voice-processor.ts:253`, `media-processor.ts:15`). Only `mass-send` is questionable.
5. **Three migrations are mid-flight, NOT converged** — `KloelMemory→MindMemory` dual-write
   (`KLOEL_MINDMEMORY_DUALWRITE`, OFF), `MindMessage` canonical-but-dead-on-read
   (`KLOEL_MINDMESSAGE_DUALWRITE`, OFF), and `ProductPlan.price`→`CheckoutProductPlan.priceInCents`.

## Canonicalization status (grounded snapshot)

- **Scope:** 179 Prisma models, ~930K LOC backend + worker TypeScript, **55 catalogued
  structural duplications** (8 P0 · 25 P1 · 17 P2 · 5 P3).
- **Converged + CI-gated (cannot re-grow):** `prisma.kloelMemory` / `prisma.kloelMessage` /
  `prisma.chatMessage` reaches are forbidden outside the Mind alias services by
  [`scripts/ops/check-canonical-mind-access.mjs`](../../scripts/ops/check-canonical-mind-access.mjs);
  the 9 product-sub-resource controllers route through the validating `resolveWorkspaceId`.
- **9 in-flight migrations** (see DEPRECATION_MAP §"In-flight migrations") are OPEN dual-write
  / delegation windows — the canonical target is written but not yet load-bearing on read.
  Treat the legacy surface as still authoritative.
- **8 open P0s** (see DUPLICATION_REGISTER §P0): logout-blacklist namespace mismatch, the
  4-way tenant-resolver IDOR fork, phone-normalization identity fragmentation, the
  Sale/Order/Payment 3-table split, the Plan-price money-unit split, the Coupon
  validate divergence, the 3× cognitive loop (one persists nothing), and the
  RAW-phone payment-link lookup that silently loses revenue.

# Wave 21 — CANONICAL_VOCABULARY Round 2 Report

> Authored by PI atomic subagent `w21-canonical-vocabulary-doc` (DeepSeek V4 Pro). Materialized 2026-05-26.


> **Date**: 2026-05-26
> **Subagent**: `w21-canonical-vocabulary-r2`
> **Mission**: Architectural Semantic Canonicalization — Round 2

## Summary

Extended the canonical vocabulary with two semantic families and expanded
EVENT_TAXONOMY.md with gap-filling event definitions. **Docs only** — no
code was renamed.## Deliverables

| # | Artifact | Status | Lines |
|---|---|---|---|
| 1 | `docs/architecture/CANONICAL_VOCABULARY_FAMILY_GLOSSARY.md` | ✅ Created | 195 |
| 2 | `docs/architecture/EVENT_TAXONOMY.md` | ✅ Extended (Round 2 expansion) | +189 |
| 3 | `docs/architecture/DEPRECATION_MAP.md` | ✅ Updated (Wave 21 entries) | +30 |
| 4 | `WAVE21_VOCAB_ROUND_2_REPORT.md` | ✅ This file | — |## 1. Family Glossary Inventory

### Family I: Contact ↔ Lead ↔ Customer ↔ Prospect ↔ Client ↔ User

**18 canonical-to-alias mappings** across 6 bounded contexts.

Key findings:

- **User** (auth) ≠ **Contact** (crm) — distinct entities, distinct Prisma models
- **Contact** is the identity hub: both `KloelLead` and `CheckoutSocialLead` link to it
- **Lead** is funnel-stage, not identity — two Prisma models (`KloelLead` for AI,
  `CheckoutSocialLead` for social capture)
- **Customer** has no Prisma model — it's a role a Contact assumes via `CheckoutOrder`
- **Prospect** has 2 occurrences (doc-comments only) — no domain model
- **Client** has 471+ occurrences — ALL `@prisma/client` imports, zero domain meaning

### Family II: ChannelSession ↔ WhatsappSession ↔ WaSession ↔ Connection ↔ Instance ↔ BotSession

**12 canonical-to-alias mappings** across 3 domains.

Key findings:

- **ChannelSession** is canonical — stored as `whatsappApiSession` JSON field in
  `Workspace.providerSettings`
- **WhatsappSessionService** is the NestJS manager; NOT a synonym but the implementation
- **MetaConnection** is OAuth-level, NOT a runtime session — distinct Prisma model
- **instance** is process-level watchdog terminology, not domain
- **botSession** and **WAHASession** are dead — zero current code occurrences

**Session sub-event taxonomy**: `qr` → generated, `connected` → live,
`disconnected` → torn down, `banned` → provider policy termination## 2. Event Taxonomy Diff

### New sections appended to EVENT_TAXONOMY.md:

| Section | Description | Events added |
|---|---|---|
| VII — channel.session.* | Canonicalizing `commerce.whatsapp.session_lifecycle` sub-events | 4 canonical + 8 legacy mappings |
| VIII — conversation.* | Cross-channel conversation lifecycle events | 5 canonical + 6 legacy mappings |
| IX — commerce.checkout.* | Spine/Brain dual-namespace clarification | 8-entry cross-namespace map |
| X — lead.qualified | Brain vs Spine distinction for lead qualification | 7-entry legacy alias mapping |
| XI — cognition.* ↔ commerce.* | Boundary rules for cognitive vs commercial events | 6 canonical events |

### Key event renames:

| Legacy | Canonical | System |
|---|---|---|
| `commerce.whatsapp.session_lifecycle` (qr) | `channel.session.qr_generated` | Spine (new) |
| `commerce.whatsapp.session_lifecycle` (connected) | `channel.session.connected` | Spine (new) |
| `commerce.whatsapp.session_lifecycle` (disconnected) | `channel.session.disconnected` | Spine (new) |
| `commerce.whatsapp.session_lifecycle` (banned) | `channel.session.banned` | Spine (new) |
| `commerce.whatsapp.handoff_to_human` | `conversation.assigned` | Spine |
| `commerce.whatsapp.conversation_resumed` | `conversation.resumed` | Spine |
| `channel.connected` (Brain) | `channel.session.connected` (Spine) | Cross-system |
| `commerce.checkout.created` (filter) | `commerce.cart.created` | Spine |
| `qualifyLead` (naming) | `lead.qualified` (Brain) | Brain |## 3. Deprecation Entries Added

**28 new rows** in DEPRECATION_MAP.md across two groups:

- **Wave 21 (Round 2) — Vocabulary family aliases** (11 entries):
  `buyer` → `Contact`, `Prospect` → `Contact`, `Client` → banned,
  `socialLead` → `CheckoutSocialLead`, `capturedLeadId` → full model,
  `waSession` → `channelSession`, `botSession`/`WAHASession` → banned,
  `instance` → kept local, `MetaConnection` → kept local,
  `connectionStatus` → `ChannelSession.status`

- **Wave 21 (Round 2) — Event alias deprecations** (17 entries):
  4 `session_lifecycle` sub-events → `channel.session.*`,
  2 `commerce.whatsapp.*` → `conversation.*`,
  2 `commerce.checkout.*` → `commerce.cart.*`/`commerce.payment.*`,
  9 legacy event names → canonical

### Status distribution:

| Status | Count |
|---|---|
| ⏳ planned | 22 |
| ⛔ banned | 4 |
| ⏸ kept local | 2 |## 4. Files Modified/Created

| File | Action | Size |
|---|---|---|
| `docs/architecture/CANONICAL_VOCABULARY_FAMILY_GLOSSARY.md` | **Created** | 195 lines, 6,585 bytes |
| `docs/architecture/EVENT_TAXONOMY.md` | **Extended** | +189 lines (499 → 688) |
| `docs/architecture/DEPRECATION_MAP.md` | **Updated** | +30 rows (207 → 237) |
| `WAVE21_VOCAB_ROUND_2_REPORT.md` | **Created** | This file |

**Protected files untouched**: CLAUDE.md, AGENTS.md, *_CONTRACT.md — all zero-touch.
**No code renamed**: This is governance + naming, not migration.## Methodology

1. **Grep Phase**: 12 codebase-wide searches across `backend/src/`, `backend/prisma/`,
   `frontend/src/`, `frontend-admin/src/`, `worker/` for the 6 symbols
   (lead, contact, customer, prospect, client, user) and 6 session terms
   (ChannelSession, WhatsappSession, WaSession, Connection, Instance, BotSession).
2. **AST verification**: `ast_grep` scoped searches for `channel.*`, `conversation.*`,
   `commerce.checkout.*`, `lead.qualified` event patterns.
3. **Prisma schema audit**: Full read of `RAC_Contact`, `RAC_KloelLead`,
   `RAC_CheckoutSocialLead`, `RAC_CheckoutOrder`, `RAC_Agent`, `AdminUser` models
   to map entity relationships.
4. **Emitter audit**: Read `WhatsAppEventEmitterService`, `CheckoutEventEmitterService`,
   `CrmEventEmitterService` source code for event name strings.
5. **Brain taxonomy cross-ref**: Read `brain-event-taxonomy.ts` (51 event types)
   and `brain-action-event-mapper.ts` for lead event mappings.

## Verification

- All files are syntactically valid Markdown
- All event names are attested with emitter file:line references
- All Prisma models are validated against `schema.prisma`
- All `.md` files are self-consistent (cross-references match)
- No protected files were touched (verified via git diff stat)

## Next Steps (Round 3)

1. Emit `channel.session.*` as standalone Spine events (code change)
2. Emit `conversation.assigned`/`conversation.resumed` as standalone events
3. Migrate `role.detector.ts` filters from `commerce.checkout.*` to `commerce.cart.*`
4. Rename `waSession` variable to `channelSession` in `unified-agent-context.service.ts`
5. Add `conversation.closed` and `conversation.unassigned` event emitters
6. Run `check-canonical-events.mjs` gate after code changes
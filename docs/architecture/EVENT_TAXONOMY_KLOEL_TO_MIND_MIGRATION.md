# Event Taxonomy Migration — `kloel.*` → `mind.*` Investigation

> Wave-5 subagent E — DEPRECATION_MAP rows #29-32. Investigation only. No code changes.
> Source ADR: [`docs/adr/0013-kloel-mind-unification.md`](../adr/0013-kloel-mind-unification.md) §4.

## TL;DR

The four legacy event names (`kloel.message.created`, `kloel.action.executed`,
`kloel.product.created`, `kloel.plan.created`) **do not exist as actual emitter
strings anywhere in the codebase**. They appear ONLY in ADR-0013 prose
(lines 66, 162-165, 204) as historical labels. The runtime taxonomy already
uses unprefixed names (`product.created`, `plan.created`, `message.received`,
`capability.executed`).

Equally important: there are **zero `@OnEvent('product.created')`,
`@OnEvent('plan.created')`, etc. consumers** in the entire backend. The
cognitive flow is event-sourced through the DB outbox (`MindOutboxEvent` +
`AutopilotEvent`) via `BrainEventSpineService.recordCommercial()` — not via
NestJS EventEmitter2 listeners. `eventEmitter.emit(...)` calls fire
into the void today; the *real* fan-out path is the outbox dispatcher.

**Recommended strategy: Aliased rename inside the canonical taxonomy
(`BRAIN_EVENT_TAXONOMY` literal) + outbox-side projection.** Big-Bang is safe
(no listeners to break) but loses the cognitive `mind.*` semantic upgrade
(`product.created` → `mind.product.observed`) embedded in ADR-0013 §4.

---

## Section A — AsyncAPI spec snapshot

File: `tools/asyncapi/asyncapi-spec.json` (4 541 lines, generator header
claims "125 events across 26 domains").

| Prefix family | Count of `"<prefix>.` channels |
|---|---|
| `account.` `affiliate.` `agent.` `ai.` `auth.` `autopilot.` `billing.` `brand.` `campaign.` `channel.` `cognition.` `commerce.` `flow.` `lineage.` `memory.` `payment.` `plan.` `product.` `pulse.` `sale.` `subscription.` `test.` `wallet.` `whatsapp.` `workspace.` | present |
| `kloel.` | **0** |
| `mind.` | **0** |
| `action.` | **0** |
| `message.` | **0** (handled under `channel.message.*` family) |

Channels for the four domains in question:

```
plan.created            (asyncapi-spec.json, line referenced via grep)
plan.deleted
plan.image_updated
plan.updated
product.pixel_configured
product.shipping_updated
product.url_added
product.url_deleted
product.url_updated
```

`product.created`, `plan.created` ARE in the BRAIN_EVENT_TAXONOMY const but
NOT in the AsyncAPI spec — the spec is partially stale relative to
`backend/src/kloel/brain-event-taxonomy.ts`.

`mind.*` only appears inside the BRAIN_EVENT_TAXONOMY const itself
(`mind.decision.created`, `mind.decision.resolved`, `mind.prediction.created`,
`mind.prediction.resolved`, `mind.surprise.recorded` —
[`backend/src/kloel/brain-event-taxonomy.ts:43-47`](../../backend/src/kloel/brain-event-taxonomy.ts#L43)).
The four targets (`mind.message.received`, `mind.action.executed`,
`mind.product.observed`, `mind.plan.observed`) have **no implementation
anywhere**.

---

## Section B — Emit-site inventory per legacy event name

### B.1 `kloel.message.created` → real emit string is `message.received`

No code uses the `kloel.` prefix. The closest analogue is the perceptual
event `message.received`, recorded via the cognitive spine (not
EventEmitter2):

| File | Line | Call shape |
|---|---|---|
| `backend/src/omnichannel/channel-inbound-hook.service.ts` | 47 | `kind: 'message.received'` — built as `MindPerceptEvent`, then `recordDurableMessageEvent()` + `mindEvents.process()` |
| `backend/src/omnichannel/channel-inbound-hook.service.ts` | 155 | `eventType: event.kind === 'message.sent' ? 'message.sent' : 'message.received'` — written to outbox |
| `backend/src/inbox/inbox.service.ts` | 193 | `webhookDispatcher.dispatch(workspaceId, 'message.received', message)` — outbound webhook, not EventEmitter |
| `backend/src/kloel/mind/perception/mind-perception.service.ts` | 75 | `kind: row.direction === 'INBOUND' ? 'message.received' : 'message.sent'` — synthesized from `RAC_Message` rows |

Payload (canonical, from [`brain-event-taxonomy.ts:74-83`](../../backend/src/kloel/brain-event-taxonomy.ts#L74)):

```ts
interface MessageEventPayload extends CommercialEventPayload {
  eventType: 'message.received' | 'message.sent';
  payload: {
    contentPreview: string;
    direction: 'INBOUND' | 'OUTBOUND';
    messageId: string;
    messageType: string;
    channel?: string;
  };
}
```

### B.2 `kloel.action.executed` → real emit strings are `capability.executed` / `brain.capability.invoked`

| File | Line | Call shape |
|---|---|---|
| `backend/src/kloel/brain-runtime.service.ts` | 220 | `action: actionSucceeded ? 'capability.executed' : 'capability.failed'` — `brainSpine.record(...)` (autopilot event row) |
| `backend/src/kloel/brain-runtime.service.ts` | 352 | same — second site, capability-result branch |
| `backend/src/kloel/brain-capability-executor.service.ts` | 538 | `action: 'brain.capability.invoked'` — invocation breadcrumb |
| `backend/src/kloel/mind/observability/mind-spine-audit.service.ts` | 66 | SQL filter `WHERE action IN ('brain.capability.invoked', 'capability.executed', 'capability.failed')` — read-side aggregator |

Payload (from [`brain-event-spine.service.ts:76-104`](../../backend/src/kloel/brain-event-spine.service.ts#L76)):

```ts
{
  action: BrainEventName;              // 'capability.executed' | 'capability.failed' | etc.
  workspaceId: string;
  intent: string;
  status: 'error' | 'executed' | 'skipped';
  contactId?: string;
  reason?: string;
  responseText?: string;
  meta?: Prisma.InputJsonObject;
}
```

### B.3 `kloel.product.created` → real emit string is `product.created` (two paths)

Path A — NestJS EventEmitter2 (no listeners; effectively dead):

| File | Line | Payload (literal) |
|---|---|---|
| `backend/src/products/product.service.ts` | 107 | `{ productId, workspaceId, agentId, name, price, format }` |

Path B — Cognitive spine outbox (this is the path that DOES get consumed by mind-runtime):

| File | Line | Payload (canonical) |
|---|---|---|
| `backend/src/products/product.service.ts` | 126 | `recordCommercial({ workspaceId, subject: 'product:'+id, eventType: 'product.created', occurredAt, payload: { productId, name, priceInCents, format } })` |

Companion product lifecycle: lines 171, 187 (`product.updated`), 283, 299
(`product.updated` from URL ops), 346, 360 (`product.published`), 406
(`product.activated`/`product.deactivated` — emit only, not in taxonomy yet),
466, 480 (`product.deleted`).

### B.4 `kloel.plan.created` → real emit string is `plan.created` (two paths)

| File | Line | Payload |
|---|---|---|
| `backend/src/plans/plan.service.ts` | 120 | `eventEmitter.emit('plan.created', { planId, productId, workspaceId, actorId, name, price })` — EventEmitter2 (no listeners) |
| `backend/src/plans/plan.service.ts` | 141 | `brainSpine.recordCommercial({ workspaceId, subject: 'plan:'+id, eventType: 'plan.created', occurredAt, payload: { planId, name, priceInCents, productId } })` — outbox path |

Companion plan lifecycle: 232 (`plan.updated` emit), 251 (`plan.updated`
recordCommercial), 281 (`plan.deleted` emit).

### B.5 Cross-cutting reference — other `recordCommercial()` call sites

| File | Lines | Event types emitted into outbox |
|---|---|---|
| `backend/src/admin/pipeline/admin-pipeline.service.ts` | 82, 123, 153 | `pipeline.state.changed`, `pipeline.shadow_recorded`, `pipeline.auto_fallback` |
| `backend/src/kloel/commercial-decision-orchestrator/telemetry.ts` | 233, 256, 281, 331, 381 | various commercial / mind decision events |
| `backend/src/kloel/mind/memory/mind-concepts.service.ts` | 105 | `concept.detected` |

---

## Section C — Consumer inventory per legacy event name

**Headline finding**: `grep -rEn "@OnEvent\(" backend/src worker --include='*.ts'`
returns **ZERO matches**. The entire backend has no NestJS EventEmitter2
listeners. Therefore the `eventEmitter.emit('product.created', ...)` and
`eventEmitter.emit('plan.created', ...)` calls in [`product.service.ts:107`](../../backend/src/products/product.service.ts#L107)
and [`plan.service.ts:120`](../../backend/src/plans/plan.service.ts#L120)
are **effectively dead emissions** (the EventEmitter2 module is still wired
for future use, but no decorator subscribes).

The actual cognitive consumers read from the outbox / autopilot tables:

| Reader | File | Lines | What it reads |
|---|---|---|---|
| `MindEventProcessorService.handleEvent` | `backend/src/kloel/mind/runtime/mind-event-processor.service.ts` | 90, 106 | branches on `event.kind === 'message.received' \|\| 'message.replied'`; promotes to `MindCase` of type `message.received` |
| `MindPolicyService` | `backend/src/kloel/mind/policy/mind-policy.service.ts` | 388-390 | delayed `message.received` outcome resolution for autopilot policies (CIA Gap 4 Phase 2) |
| `MindPerceptionService.streamSince` | `backend/src/kloel/mind/perception/mind-perception.service.ts` | 75 | synthesizes `message.received` / `message.sent` from `RAC_Message` rows |
| `MindPerceptionService.streamSince` (product) | `backend/src/kloel/mind-perception.service.ts` | 170 | `kind: row.createdAt > since ? 'product.created' : 'product.updated'` — synthesizes from `RAC_Product` rows |
| `MindObservabilityService` | `backend/src/kloel/mind/observability/mind-observability.service.ts` | 159 | `WHERE action: 'message.received'` count metric |
| `MindSpineAuditService` | `backend/src/kloel/mind/observability/mind-spine-audit.service.ts` | 66, 94-98 | SQL aggregator across `brain.capability.invoked` / `capability.executed` / `capability.failed` |
| `BrainCapabilityExecutorSubstrate` | `backend/src/kloel/brain-capability-executor.substrate.helpers.ts` | 22 | partial outcome resolution: `partialKinds: ['message.received','message.sent','autopilot']` |
| `MindDecisionCatalog` | `backend/src/kloel/mind-decision-catalog.ts` | 10, 20, 67 | declares `outcomeEvent: 'message.received'` for 3 decision policies |
| `RoleDetector` | `backend/src/kloel/role/role.detector.ts` | 19 | reads `commerce.product.created` (NOT `product.created`) — a *different* event family |
| Webhook fan-out | `backend/src/inbox/inbox.service.ts` | 193 | `webhookDispatcher.dispatch(workspaceId, 'message.received', message)` — *external* customer webhooks |

**Conclusion**: rename-by-emit-string only breaks the SQL string-literal
filters in `mind-observability.service.ts:159`, `mind-spine-audit.service.ts:66`,
the `partialKinds` whitelist, the decision-catalog `outcomeEvent`, and the
perception-service synthesized `kind`. No decorator subscriptions, no
EventEmitter2 listeners. Significantly less risky than the ADR-0013 prose
suggests.

---

## Section D — `mind.*` equivalents — already defined?

| Target | Defined as type? | Implemented as emitter? | Implemented as consumer? |
|---|---|---|---|
| `mind.message.received` | ❌ — not in `BRAIN_EVENT_TAXONOMY` literal | ❌ no call sites | ❌ no readers |
| `mind.action.executed` | ❌ — not in `BRAIN_EVENT_TAXONOMY` literal | ❌ | ❌ |
| `mind.product.observed` | ❌ — not in `BRAIN_EVENT_TAXONOMY` literal | ❌ | ❌ |
| `mind.plan.observed` | ❌ — not in `BRAIN_EVENT_TAXONOMY` literal | ❌ | ❌ |

What `mind.*` IS already canonical (existing today, in [`brain-event-taxonomy.ts:43-47`](../../backend/src/kloel/brain-event-taxonomy.ts#L43)):

```
mind.decision.created
mind.decision.resolved
mind.prediction.created
mind.prediction.resolved
mind.surprise.recorded
```

These five are the *output* of the cognitive loop (decisions / predictions /
surprises). The four targets in this migration would be the *input perception*
side — semantically distinct.

Worth noting: `mind-event-spine.service.ts` (the canonical 18-line wrapper)
documents the intent in its JSDoc — *"central nervous system that re-emits raw
CRUD events (`product.created`, `plan.created`, `channel.message.received`,
etc.) as canonical `mind.*` events"* — but the re-emission code does not exist
yet. The wrapper is a name-alias only.

---

## Section E — Recommended strategy: **Aliased canonical**

Three options were considered:

### Option 1 — Big-Bang rename
Pros: simplest; no consumers exist for the legacy strings so the blast radius
is tiny. Cons: silently breaks the SQL string-literal aggregators and the
ADR-0013 §4 contract (which calls for additive aliasing with a 4-week grace
window). Also pure rename loses the `created → observed`, `executed → executed`,
`message → message.received` semantic upgrade that ADR-0013 §4 is actually
about (perception vs production).

### Option 2 — Dual-Emit
Pros: ADR-compliant; readers can migrate at their own pace. Cons: doubles the
outbox row count for 4 weeks (~2x storage / dispatch load on
`MindOutboxEvent` + `AutopilotEvent`). The outbox already uses an idempotency
key per `(workspaceId, idempotencyKey)` and would need a key suffix per
alias variant to avoid upsert collisions. Adds DB hot-path complexity.

### Option 3 — **Aliased canonical (RECOMMENDED)** ✅
Introduce the four `mind.*` names in `BRAIN_EVENT_TAXONOMY` as additive
entries. Emit ONLY the canonical name (`mind.product.observed`) at the
outbox layer. Add a thin alias table (TS const) that maps legacy → canonical
so consumers (SQL aggregators, decision-catalog `outcomeEvent`, partialKinds
whitelist) can match either spelling during the transition. Remove the
alias table after 4 weeks and 0 grep hits for the legacy form.

Why this wins:

- **No double-write** to the outbox (option 2's main downside avoided).
- **Idempotency keys keep their meaning** — only the eventType column value
  changes for new rows.
- **Reversible** — revert means swapping the eventType string in 2-3 emit
  sites + removing the alias table.
- **ADR-0013-aligned** — §4 explicitly asks for "alias retroativo".
- **Lowest risk** — given zero EventEmitter2 listeners exist, the only
  consumer surface to update is the SQL string filters + decision-catalog
  literals + mind-runtime branch conditions, all of which can read the alias
  map.

---

## Section F — Step-by-step plan (Option 3)

1. **Extend `BRAIN_EVENT_TAXONOMY`** in `backend/src/kloel/brain-event-taxonomy.ts`
   by appending: `'mind.message.received'`, `'mind.action.executed'`,
   `'mind.product.observed'`, `'mind.plan.observed'`. Bump
   `BrainEventName` union automatically.

2. **Add `MIND_EVENT_ALIASES` constant** in the same file:
   ```ts
   export const MIND_EVENT_ALIASES = {
     'message.received': 'mind.message.received',
     'capability.executed': 'mind.action.executed',
     'product.created': 'mind.product.observed',
     'plan.created': 'mind.plan.observed',
   } as const;
   export const MIND_EVENT_LEGACY = Object.fromEntries(
     Object.entries(MIND_EVENT_ALIASES).map(([k, v]) => [v, k])
   ) as Record<string, string>;
   ```

3. **Update emitters** to write the canonical `mind.*` name to
   `recordCommercial({ eventType })`:
   - `backend/src/products/product.service.ts:129` `product.created` → `mind.product.observed`
   - `backend/src/plans/plan.service.ts:144` `plan.created` → `mind.plan.observed`
   - `backend/src/omnichannel/channel-inbound-hook.service.ts:47,155` `message.received` → `mind.message.received`
   - `backend/src/kloel/brain-runtime.service.ts:220,352` `capability.executed` → `mind.action.executed`
   The legacy `eventEmitter.emit(...)` Path-A calls remain as-is (dead
   listeners, no consumers — separate cleanup).

4. **Update SQL aggregators** to accept both names via the alias map:
   - `backend/src/kloel/mind/observability/mind-spine-audit.service.ts:66`
     `WHERE action IN ('brain.capability.invoked', 'capability.executed', 'capability.failed', 'mind.action.executed')`
   - `backend/src/kloel/mind/observability/mind-observability.service.ts:159`
     `where: { workspaceId, action: { in: ['message.received', 'mind.message.received'] } }`

5. **Update branch conditions** in mind-runtime that read `event.kind`:
   - `backend/src/kloel/mind/runtime/mind-event-processor.service.ts:90,106`
   - `backend/src/kloel/mind/policy/mind-policy.service.ts:388`
   - `backend/src/kloel/brain-capability-executor.substrate.helpers.ts:22`
   - `backend/src/kloel/mind-decision-catalog.ts:10,20,67`
   Each should accept either the legacy or canonical name via the alias map
   during the grace window.

6. **Update perception synthesizers** to emit canonical names:
   - `backend/src/kloel/mind/perception/mind-perception.service.ts:75`
   - `backend/src/kloel/mind-perception.service.ts:170`

7. **Update AsyncAPI spec** by re-running the generator (`tools/asyncapi/...`
   if a producer exists) or by adding the four channels manually so the
   contract surface is honest.

8. **Add tests** asserting alias resolution: `MIND_EVENT_ALIASES` round-trips,
   aggregators count both names, mind-event-processor handles both kinds.

9. **Grace window — 4 weeks**: run nightly query
   `SELECT COUNT(*) FROM "AutopilotEvent" WHERE action IN ('message.received','product.created','plan.created','capability.executed') AND "createdAt" > NOW() - INTERVAL '24 hours'`.
   When count is 0 for 7 consecutive days, schedule removal PR.

10. **Removal PR**: drop legacy names from `BRAIN_EVENT_TAXONOMY`, drop
    `MIND_EVENT_ALIASES`, simplify aggregators. Update `DEPRECATION_MAP.md`
    rows #29-32 to `COMPLETE`.

---

## Section G — Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Idempotency keys are computed as `${eventType}:${subject}:${occurredAt}` in [`brain-event-spine.service.ts:108-110`](../../backend/src/kloel/brain-event-spine.service.ts#L108). Changing eventType changes the key, so an in-flight event emitted twice across a deploy boundary (once as `product.created`, once as `mind.product.observed`) will create **two outbox rows**. | High | Choose deploy moment carefully OR add migration step that backfills the legacy `idempotencyKey` for the canonical name. |
| External webhook subscribers via `webhookDispatcher.dispatch(workspaceId, 'message.received', ...)` ([`inbox.service.ts:193`](../../backend/src/inbox/inbox.service.ts#L193)) — third parties have configured their endpoints with the literal string `message.received`. | High | Webhook dispatch name is a **distinct contract** from the cognitive event name. Do NOT rename the dispatch name; keep it as `message.received`. ADR-0013 §4 only governs internal cognitive events. |
| `MindDecisionCatalog.outcomeEvent` ([`mind-decision-catalog.ts:10,20,67`](../../backend/src/kloel/mind-decision-catalog.ts#L10)) is a string literal compared at runtime to inbound event kinds — silently miscompares if alias map isn't applied. | Medium | Step 5 plan task — accept both names during grace. Spec covers this branch. |
| `BRAIN_EVENT_TAXONOMY` is `as const` — adding members is type-additive and safe, but type narrowing in handlers that exhaustive-switch on `BrainEventName` could fail TSC. | Medium | TSC will catch this at PR time; add default branches that no-op. |
| `Role` detection uses `commerce.product.created` ([`role.detector.ts:19`](../../backend/src/kloel/role/role.detector.ts#L19)) — a *different* event family unrelated to this migration. | Low | Out of scope. Do not touch. |
| `eventEmitter.emit(...)` Path-A calls (product/plan services) currently have no listeners but ARE part of a future-listener contract. Leaving them un-aliased means future subscribers will only see legacy names. | Low | Document in `EVENT_TAXONOMY.md` that EventEmitter2 emits use legacy names; outbox uses canonical. Decide future-listener contract in a separate ADR. |
| Mind perception services SYNTHESIZE events from DB rows — they don't read prior outbox entries. After rename, synthesized events use canonical name, but historical outbox rows still carry legacy names. Time-window queries that join across both periods will see two distinct strings. | Medium | Alias map in step 4 step 5; aggregators handle both. |

---

## Cross-references

- ADR: [`docs/adr/0013-kloel-mind-unification.md`](../adr/0013-kloel-mind-unification.md) §4 + Wave M6.
- Taxonomy: [`backend/src/kloel/brain-event-taxonomy.ts`](../../backend/src/kloel/brain-event-taxonomy.ts).
- Spine: [`backend/src/kloel/brain-event-spine.service.ts`](../../backend/src/kloel/brain-event-spine.service.ts).
- Canonical wrapper: [`backend/src/kloel/mind/coordination/mind-event-spine.service.ts`](../../backend/src/kloel/mind/coordination/mind-event-spine.service.ts).
- Existing inventory: [`docs/architecture/EVENT_TAXONOMY.md`](EVENT_TAXONOMY.md).
- Deprecation map: [`docs/architecture/DEPRECATION_MAP.md`](DEPRECATION_MAP.md) rows #29-32.

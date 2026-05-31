# Event Taxonomy Migration — `kloel.*` → `cognition.*`

> **PI Task K35-E** — Non-destructive alias migration of the remaining
> `kloel.*` event names into the canonical `cognition.*` namespace, per the
> Brain→Mind unification (ADR-0013 §4) and
> [`EVENT_TAXONOMY.md`](EVENT_TAXONOMY.md) §2.9.

## TL;DR

Three legacy `kloel.*` event names still ship from the backend. They are now
aliased to canonical `cognition.*` names via
[`backend/src/kloel/event-taxonomy.canonical-aliases.ts`](../../backend/src/kloel/event-taxonomy.canonical-aliases.ts).
Both names fire on every trigger — no consumer breaks; readers can migrate at
their own pace.

| Deprecated (legacy `kloel.*`) | Canonical (`cognition.*`) | Emit-side status |
|---|---|---|
| `kloel.handoff.confidence` | `cognition.handoff.confidence` | Dual-emit live |
| `kloel.handoff.confidence.blocking` | `cognition.handoff.confidence.blocking` | Dual-emit live |
| `kloel.chat.turn` | `cognition.chat.turn` | Dual-emit live |

## Emit Sites

| Legacy name | File | Line | Channel |
|---|---|---|---|
| `kloel.handoff.confidence` | `backend/src/kloel/kloel-thinker.service.ts` | ~327 | `logger.log` structured-log context |
| `kloel.handoff.confidence.blocking` | `backend/src/kloel/kloel-thinker.service.ts` | ~340 | `logger.warn` structured-log context |
| `kloel.handoff.confidence.blocking` | `backend/src/kloel/kloel-thinker.abi.helpers.ts` | 115 | Built into `buildHandoffEscalationLog` (marked `@deprecated`) |
| `kloel.chat.turn` | `backend/src/kloel/kloel-thinker.helpers.ts` | ~190 | `prisma.autopilotEvent.action` (cognitive spine row) |
| `kloel.chat.turn` | `backend/src/kloel/kloel-thinker-think.helpers.ts` | ~470 | `prisma.autopilotEvent.action` (cognitive spine row) |

## How the alias helper works

`emitCognitionAlias(emit, legacy, payload)` invokes the caller-provided emit
callback twice — once with the legacy name, once with the canonical name. When
the payload carries a `context` field (structured-log convention), the field is
rewritten per emission so the log channel matches the event name.

For DB-persisted events (`autopilotEvent.action`) the helper creates two rows
per trigger. There is no `@@unique([workspaceId, action])` constraint on
`AutopilotEvent`, so this is safe; the cost is one extra row per chat turn
during the grace window.

## Workspace isolation

The helper performs no I/O. Each emit site is responsible for passing
`workspaceId` into its payload; both emissions carry the same `workspaceId`
(verified by the anti-regression spec).

## Anti-regression

[`backend/src/kloel/event-taxonomy.canonical-aliases.spec.ts`](../../backend/src/kloel/event-taxonomy.canonical-aliases.spec.ts)
asserts that:

1. The alias map contains exactly the three legacy names from the macro audit.
2. Every canonical name uses the `cognition.*` prefix with the same suffix.
3. `emitCognitionAlias` fires exactly two events per trigger (legacy then
   canonical) with payload preserved across both.
4. `workspaceId` is preserved across emissions (workspace isolation).

## Removal criteria (4-week grace window)

After PR merge to `main`, run nightly:

```sql
SELECT action, COUNT(*) AS hits
FROM "RAC_AutopilotEvent"
WHERE action IN ('kloel.chat.turn')
  AND "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY action;
```

When `hits = 0` for 7 consecutive days **and** no log query in observability
dashboards still selects on `context = 'kloel.handoff.confidence*'`, open a
removal PR that:

1. Removes the entry from `KLOEL_TO_COGNITION_ALIAS`.
2. Flips the `context:` field in `buildHandoffEscalationLog` to the canonical
   name and drops the `@deprecated` tag.
3. Replaces the dual-emit call sites with single canonical emissions.
4. Updates this document to mark each row as `REMOVED`.

## Cross-references

- ADR: [`docs/adr/0013-kloel-mind-unification.md`](../adr/0013-kloel-mind-unification.md)
- Existing taxonomy: [`EVENT_TAXONOMY.md`](EVENT_TAXONOMY.md)
- Prior investigation: [`EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md`](EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md)
- Helper module: [`backend/src/kloel/event-taxonomy.canonical-aliases.ts`](../../backend/src/kloel/event-taxonomy.canonical-aliases.ts)
- Anti-regression spec: [`backend/src/kloel/event-taxonomy.canonical-aliases.spec.ts`](../../backend/src/kloel/event-taxonomy.canonical-aliases.spec.ts)

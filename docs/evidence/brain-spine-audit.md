# Brain Spine Audit

## Purpose

Verifies that every brain capability invocation through `/brain/decide` leaves a
corresponding record in the `AutopilotEvent` spine. When a capability runs but
no `brain.capability.invoked` event is recorded, there is a spine gap — a
missing observability record for the execution.

## Endpoint

```
GET /admin/brain/spine-audit?since=ISO8601
```

Admin-only. Requires `AdminModule.RELATORIOS, AdminAction.VIEW`.

Default `since`: 24 hours ago.

## Response Shape

```json
{
  "capabilities": [
    {
      "name": "list_products",
      "invocations": 3,
      "spineEvents": 3,
      "missing": 0,
      "samples": [
        { "traceId": "uuid-1", "at": "2026-05-12T10:00:00.000Z" }
      ]
    }
  ],
  "totalMismatch": 0,
  "windowFrom": "2026-05-11T00:00:00.000Z",
  "windowTo": "2026-05-12T10:00:00.000Z"
}
```

### Field Meanings

| Field | Meaning |
|-------|---------|
| `name` | Capability name (e.g. `list_products`, `search_contact`) |
| `invocations` | Count of `capability.executed` + `capability.failed` events |
| `spineEvents` | Count of `brain.capability.invoked` events |
| `missing` | `invocations - spineEvents` — should be 0 |
| `totalMismatch` | Sum of all `missing` across capabilities |
| `windowFrom` / `windowTo` | Time range of the audit |
| `samples` | Up to 5 sample event IDs with timestamps |

## Interpretation

- **`missing = 0`**: Every capability execution produced a spine event.
  Healthy.
- **`missing > 0`**: A capability executed (`capability.executed` or
  `capability.failed`) but no `brain.capability.invoked` spine event was
  recorded. This is a BUG.

## Root Cause of Mismatches

The `brain.capability.invoked` event is emitted by
`BrainCapabilityExecutorService.emitCapabilityInvoked()` (in
`backend/src/kloel/brain-capability-executor.service.ts:222-243`). This is a
best-effort call — errors are silently caught.

A mismatch means:
1. The capability executor ran (producing `capability.executed`/`capability.failed`).
2. The `emitCapabilityInvoked()` call failed silently (DB error, connection
   issue, or unhandled exception in the event spine service).

## How It Works

The audit service queries `RAC_AutopilotEvent` for three event types in the
given window:

- `brain.capability.invoked` (spine record)
- `capability.executed` (successful invocation)
- `capability.failed` (failed invocation)

Capability name is extracted from either:
- The `intent` column (for operator capabilities like `list_products`)
- The `meta->action->tool` JSONB path (for LLM-decided capabilities)

Results are grouped by capability name and sorted by mismatch descending.

## Sample Audit (No Mismatches)

```json
{
  "capabilities": [
    { "name": "list_products", "invocations": 12, "spineEvents": 12, "missing": 0 },
    { "name": "search_contact", "invocations": 8, "spineEvents": 8, "missing": 0 },
    { "name": "list_conversations", "invocations": 5, "spineEvents": 5, "missing": 0 },
    { "name": "send_message_via_channel", "invocations": 3, "spineEvents": 3, "missing": 0 },
    { "name": "query_revenue_summary", "invocations": 2, "spineEvents": 2, "missing": 0 },
    { "name": "send_message", "invocations": 4, "spineEvents": 0, "missing": 4 },
    { "name": "create_payment_link", "invocations": 1, "spineEvents": 0, "missing": 1 }
  ],
  "totalMismatch": 5,
  "windowFrom": "2026-05-11T00:00:00.000Z",
  "windowTo": "2026-05-12T10:00:00.000Z"
}
```

In this example, the 5 operator capabilities are healthy (zero missing). The
LLM-decided capabilities (`send_message`, `create_payment_link`) have no spine
events because they are resolved by the unified LLM agent and do not pass
through `BrainCapabilityExecutorService.emitCapabilityInvoked()`. This is a
known design: only the 5 operator capabilities emit `brain.capability.invoked`.

If an operator capability shows `missing > 0`, escalate as a bug.

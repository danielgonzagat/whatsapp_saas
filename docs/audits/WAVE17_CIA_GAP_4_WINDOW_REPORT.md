# Wave 17 — CIA Gap 4 Phase 2: Delayed message.received Outcome Resolution

> Authored by PI atomic subagent `w17-cia-gap-4-window-resolution` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/kloel/mind-policy.service.ts` | Added `confirmAutopilotOutcome()` method — finds resolved `autopilot_action` policies for a contact and marks `context.outcomeConfidence` as `'confirmed'` (within 30 min window) or `'unanswered'` (outside window) |
| `backend/src/kloel/mind-event-processor.service.ts` | Wired `confirmAutopilotOutcome()` into `processMessageReceived()` — called when a `message.received` or `message.replied` event arrives with a `contact:` subject |
| `backend/src/kloel/mind-event-processor.service.spec.ts` | Added 4 tests for CIA Gap 4 Phase 2 covering both confirmation paths, contactId extraction, non-contact guard, and resolved count accumulation |

## 2. Test Result

```
PASS src/kloel/mind-event-processor.service.spec.ts (15.36 s)
  MindEventProcessorService
    ✓ closes reply-oriented MIND decisions when an inbound message arrives
    ✓ closes conversion-oriented MIND decisions when checkout is paid
    ✓ closes human transfer decisions when autopilot qualifies a lead
    ✓ closes human transfer when commercial lead events arrive through the event spine
    ✓ closes campaign decisions when commercial campaign conversion events arrive
    ✓ closes checkout outcomes as failed when checkout expires
    ✓ closes human transfer and campaign outcomes from explicit commercial events
    ✓ closes ad alert outcomes from metric movement events
    CIA Gap 4 Phase 2 — delayed message.received outcome resolution
      ✓ confirms autopilot_action outcome when message.received arrives from the same contact
      ✓ extracts contactId from subject correctly for message.received
      ✓ does not call confirmAutopilotOutcome for non-contact subjects
      ✓ adds confirmed+unanswered counts to result.resolved

Tests: 12 passed, 12 total
```

Policy service tests also all pass: 21/21.

## 3. Backend tsc Result

**PASS** — zero new type errors in modified files. The one pre-existing error at `mind-policy.service.ts:566` (`applyWisdomPriors` channel narrowing) is unrelated to this change.

## 4. Window Length + Rationale

**Window: 30 minutes** (configurable via `windowMinutes` parameter, defaults to 30).

Rationale:
- Aligned with `followup_timing` baseline of `30m` in `MIND_DECISION_CATALOG` (the system's own expectation for reply turnaround).
- Short enough to be a meaningful signal (a reply within 30 minutes indicates active engagement with the sent message).
- Long enough to account for message delivery latency, WhatsApp/Instagram transport delays, and human typing time.
- Configurable per-call so it can be tuned per channel or segment without code changes.

## 5. Architecture

### Phase 1 (Wave 13 — already shipped)
`CiaSendHelpersService.sendCiaMessageWithDailyLimit()` calls `mindPolicy.resolveOpenForSubject()` with `decisionType: 'autopilot_action'`, `outcome: 1` on successful send. This sets `outcome=1` and `resolvedAt=now()` on the policy row.

### Phase 2 (this wave)
```
message.received event
  → MindEventProcessorService.processMessageReceived()
    → extracts contactId from subject ("contact:<id>")
    → calls MindPolicyService.confirmAutopilotOutcome({ workspaceId, contactId })
      → queries mindPolicy WHERE:
          workspaceId, subject="contact:<id>",
          decisionType='autopilot_action',
          outcome=1, resolvedAt NOT NULL
      → for each unmatched policy:
          resolvedAt >= now-30min → context.outcomeConfidence = 'confirmed'
          resolvedAt <  now-30min → context.outcomeConfidence = 'unanswered'
      → skips policies that already have outcomeConfidence set
      → returns { confirmed, unanswered } counts
```

The confidence marker is stored in the existing `context` JSONB column — **no schema changes**, per constraints.

### Invariants preserved
- `outcome` stays `1` for delivery success regardless of confidence marker.
- Already-classified policies are idempotent (skip if `outcomeConfidence` present).
- Non-contact subjects (workspace-level, order-level) never trigger the check.
- Failures in `confirmAutopilotOutcome` bubble to the caller; the rest of `processMessageReceived` continues via Promise semantics.

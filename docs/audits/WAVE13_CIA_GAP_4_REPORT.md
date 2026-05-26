# Wave 13 — CIA Gap 4: Outcome Traceability (Inline Send Success Slice)

> Authored by PI atomic subagent `w13-cia-gap-4-outcome-trace` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Status**: ✅ Complete  
**Date**: 2026-05-26

## 1. Files Modified

| File | Change |
|---|---|
| `backend/src/cia/cia-send-helpers.service.ts` | Added `MindPolicyService` import, injected optional dependency, added `resolveOpenForSubject` call after successful send |
| `backend/src/cia/cia-send-helpers.service.spec.ts` | Added `MindPolicyService` mock and 5 new test cases |

## 2. Test Result

```
backend: jest src/cia/cia-send-helpers.service.spec.ts — PASS (exitCode 0)
```

### New tests added (5):

1. **resolves autopilot_action policy on successful send with contactId** — verifies `resolveOpenForSubject` called with `subject: 'contact:contact-4'`, `decisionType: 'autopilot_action'`, `outcome: 1`
2. **resolves autopilot_action with phone fallback when contactId is null** — verifies phone used as subject when contactId missing
3. **does NOT resolve when no open policy exists (no-op, no error)** — verifies resolve call still made, returns 0 resolved, no error thrown
4. **does NOT throw when resolve fails, still returns send success** — verifies try/catch wrapper doesn't block send
5. **does NOT resolve when send fails** — verifies resolve skipped when transport send fails

## 3. Backend tsc Result

```
backend: tsc -p tsconfig.build.json --noEmit — PASS (exitCode 0)
```

## 4. New Resolve Call Snippet

```typescript
// In CiaSendHelpersService.sendCiaMessageWithDailyLimit, after spine emit (inside else block):
try {
  const subject = contactId ? `contact:${contactId}` : phone;
  await this.mindPolicy?.resolveOpenForSubject({
    workspaceId,
    subject,
    decisionType: 'autopilot_action',
    outcome: 1,
  });
} catch (err: unknown) {
  this.logger.warn(
    `MIND policy resolve failed after CIA send: ${(err as Error)?.message ?? String(err)}`,
  );
}
```

## 5. Confirmation: Resolve Failures Don't Block Send

- `mindPolicy` is injected with `@Optional()` — absent service → no-op via `?.`
- Resolve call is wrapped in try/catch → logs a warning, never throws
- Test `does NOT throw when resolve fails, still returns send success` proves this behavior
- Resolve only executes after `sendResult.success === true` and after spine emit attempt (which itself has independent try/catch)

## Deferred (NOT in this PR)

Phase 2 of the Gap 4 recommendation: delayed final outcome resolution via `message.received` event window.

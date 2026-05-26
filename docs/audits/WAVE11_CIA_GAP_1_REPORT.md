# Wave 11 — CIA Gap 1: Spine Emission from CIA Operational Layer

> Authored by PI atomic subagent `w11-cia-gap-1-spine-emission` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/cia/cia-send-helpers.service.ts` | Added `SpineEmitterService` import; added `@Optional() spineEmitter` constructor param; added `contactId?`, `runId?`, `action?` optional params to `sendCiaMessageWithDailyLimit()`; spine emission in `try/catch` after successful send |
| `backend/src/cia/cia-send-helpers.service.spec.ts` | Added `SpineEmitterService` mock provider; 4 new test cases for spine emission behavior |
| `backend/src/cia/cia.module.ts` | Imported `SpineModule` to provide `SpineEmitterService` to CIA module |
| `backend/src/cia/cia-inline-fallback.service.ts` | Passes `contactId`, `runId`, `'backlog_inline_fallback'` to `sendCiaMessageWithDailyLimit()` |
| `backend/src/cia/cia-remote-backlog.service.ts` | Passes `contactId`, `runId`, `'remote_backlog_inline_fallback'` to `sendCiaMessageWithDailyLimit()` |

## 2. Spec Result

```
Test Suites: 1 passed, 1 total
Tests:       27 passed, 27 total
```

New tests added:
- ✓ emits cognition.cia_backlog_action spine event on successful send
- ✓ does NOT emit spine event when send fails
- ✓ does NOT emit spine event when daily limit is reached
- ✓ does NOT throw when spine emit fails, still returns success

All caller specs also pass:
- `cia-inline-fallback.service.spec.ts` — passed
- `cia-remote-backlog.service.spec.ts` — passed
- `whatsapp/cia-inline-fallback.service.spec.ts` — passed
- `whatsapp/cia-remote-backlog.service.spec.ts` — passed

## 3. Backend tsc Result

Pre-existing errors only (none in modified files):
- `brain-runtime.service.ts(75,22)`: unused property
- `capability-registry-v2.const.ts(9-10)`: redeclared variable
- `capability-registry-v2.service.ts(3,8)`: unused import
- `kloel.module.ts(454,5)`: missing `IntentRouterService`

Zero new type errors from this PR.

## 4. New Emit Call Snippet

```typescript
      } else {
        try {
          await this.spineEmitter?.emit({
            eventName: 'cognition.cia_backlog_action',
            workspaceId,
            truthMode: 'observed',
            provenance: {
              source: 'production',
              processor: 'cia-send-helpers',
              processorVersion: '1.0.0',
              schemaVersion: '1.0.0',
            },
            payload: { contactId, runId, action, channel: 'whatsapp' },
          });
        } catch (err: unknown) {
          this.logger.warn(
            `Spine emit failed for cognition.cia_backlog_action: ${(err as Error)?.message ?? String(err)}`,
          );
        }
      }
```

## 5. Why the Spine-Failure Path Is Safe

1. **`try/catch` wraps only the emit call.** If `spineEmitter.emit()` throws (e.g., `ValenceTaggerService` fails, ring buffer corruption, subscriber error), the `catch` block logs a warning and execution continues to the return statement.

2. **`spineEmitter` is `@Optional()`.** If `SpineEmitterService` is not provided by the DI container (e.g., in minimal test environments), `this.spineEmitter` is `undefined` and the optional chain `?.emit()` short-circuits to `undefined` — no call, no throw.

3. **Emission happens AFTER the transport send succeeds.** The `else` branch only runs when `sendResult.success === true`. The message has already been delivered to the recipient before the spine event is attempted. A spine failure after delivery cannot un-deliver the message.

4. **The return value is computed independently.** `sendResult.success`, `sendResult.error`, `sendResult.messageId`, etc. are captured before the spine emission. The caller receives the correct result regardless of spine outcome.

5. **Verified by test.** The test `does NOT throw when spine emit fails, still returns success` confirms: when `spineEmitter.emit()` rejects, the method still returns `{ success: true, messageId: 'msg-3' }`.
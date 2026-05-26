# Wave 17 — Decompose kloel-tool-dispatcher.service.ts

> Authored by PI atomic subagent `w17-decompose-tool-dispatcher` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Lines Extracted + New LOC

| Metric | Before | After |
|--------|--------|-------|
| `kloel-tool-dispatcher.service.ts` | 634 LOC | 484 LOC |
| Extracted | — | 150 LOC |
| New helper | — | 183 LOC |
| Total (service + helper) | 634 LOC | 667 LOC |

**Net reduction in service file: 150 lines (23.7%).**

The 33-line net increase in total is expected: the thin-delegator pattern adds import/export/function-signature boilerplate to the extracted module, which is a one-time cost per extraction.

## 2. Files Created

- `backend/src/kloel/kloel-tool-dispatcher.approval.helpers.ts` (183 LOC)

## 3. What Was Extracted

The **approval workflow** — a cohesive group responsible for high-risk tool approval lifecycle:

| Method | Old LOC | New LOC (in service) | Extracted To |
|--------|---------|---------------------|-------------|
| `requestHighRiskApproval` | 35 | 7 (thin delegator) | `runRequestHighRiskApproval` |
| `executeApprovedApprovalRequest` | 67 | 5 (thin delegator) | `runExecuteApprovedApprovalRequest` |
| `readApprovedToolPayload` | 10 | 0 (removed) | `readApprovedToolPayload` (private, helpers) |
| `executeApprovedHighRiskTool` | 11 | 0 (removed) | `runExecuteApprovedHighRiskTool` (private, helpers) |
| `ApprovedToolExecutionResult` type | 7 | 0 (removed) | Re-exported by helpers |

The extracted helpers file follows the same pattern as the existing chat-tools decomposition (`kloel-chat-tools.settings-policy.helpers.ts`, etc.): standalone `run*` functions that take dependencies as parameters.

### Import cleanup

The service previously imported 5 symbols from `kloel-tool-dispatcher.high-risk.helpers`. After extraction, only `sanitizeDetails` is still used (by `dispatchCreatePaymentLink`). The other 4 (`titleForHighRiskTool`, `promptForHighRiskTool`, `isSupportedApprovedHighRiskTool`, `isRecord`) are now consumed solely by the new helpers. The unused `Prisma` namespace import was also removed.

### Public API preserved

- `executeApprovedApprovalRequest(input)` — still a public method on the service with identical signature.
- `requestHighRiskApproval(...)` — still a private method on the service, called from the `executeTool` switch statement.
- Both now delegate to the extracted helpers functions.

## 4. Backend tsc Result

```
PASS — tsc -p tsconfig.build.json --noEmit exits 0, no errors.
```

## 5. Spec Result

```
PASS  src/kloel/kloel-tool-dispatcher.service.spec.ts
PASS  src/kloel/kloel-tool-dispatcher.service.approval.spec.ts
FAIL  src/kloel/kloel-tool-dispatcher.service.chat-tools.spec.ts (1 test)

Tests: 46 passed, 1 failed, 47 total
```

The single failure is **pre-existing**:
- `routes search_agent_memory to chatToolsService` — the test expects `chatToolsService.toolSearchAgentMemory` but the actual dispatch code (unchanged by this extraction) routes to `bizConfigToolsService.toolListLeads`. This mismatch exists in the original code before extraction.

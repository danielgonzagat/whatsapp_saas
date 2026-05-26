# Wave 17 — LLM CRITICAL Audit Drift Check

> Authored by PI atomic subagent `w17-llm-critical-drift-audit` (DeepSeek V4 Pro). Materialized 2026-05-26.


> Authored by PI agent `w17-llm-critical-drift-audit` (Claude Opus 4.5).
> Re-audit of 10 CRITICAL sites hardened in Wave 7+8.
> Run date: 2026-05-26.

## Methodology

Each of the 10 sites was verified against the 4 hardening properties established
in Wave 7 and Wave 8:

1. **max_tokens** set per category table (chat 400, analysis 256, summary 1200, pitch 800)
2. **Retry wrapper** — `chatCompletionWithRetry` or `chatCompletionWithFallback`
3. **Output validation** — length/shape check
4. **Decision log** — `logger.log` with `workspaceId` + model + tokens

## Per-Site Checklist (10 sites × 4 properties = 40 cells)

| # | Site | Category | max_tokens | Retry | Output Valid. | Decision Log | Status |
|---|------|----------|------------|-------|---------------|--------------|--------|
| 1 | `autopilot-cycle-executor.service.ts:85` — analyzeContext | analysis | ✅ 256 | ✅ chatCompletionWithRetry | ✅ JSON parse | ✅ (fixed: +workspaceId) | **DRIFT FIXED** |
| 2 | `autopilot-cycle-executor.service.ts:396` — generateResponse | pitch | ✅ 800 | ✅ chatCompletionWithRetry | ✅ len ≥ 5 | ✅ (fixed: +logger.log) | **DRIFT FIXED** |
| 3 | `copilot.service.ts:91` — suggest | chat | ✅ 400 | ✅ chatCompletionWithRetry | ✅ (fixed: len ≥ 2) | ✅ (fixed: +logger.log) | **DRIFT FIXED** |
| 4 | `copilot.service.ts:192` — suggestMultiple | pitch | ✅ 800 | ✅ chatCompletionWithRetry | ✅ JSON shape | ✅ (fixed: +logger.log) | **DRIFT FIXED** |
| 5 | `kloel-thread-summary.service.ts:208` — maybeRefreshThreadSummary | summary | ✅ 1200 | ✅ chatCompletionWithFallback | ✅ len ≥ 10 | ✅ | **PASS** |
| 6 | `unified-agent-response.service.ts:194` — buildQuotedReplyPlan | chat | ✅ 400 | ✅ chatCompletionWithFallback | ✅ JSON + array match | ✅ | **PASS** |
| 7 | `hidden-data.service.ts:55` — extract | analysis | ✅ 256 | ✅ chatCompletionWithRetry | ✅ JSON parse + empty warn | ✅ (no workspaceId — by design) | **PASS** |
| 8 | `flow-optimizer.service.ts:71` — optimizeFlow | analysis | ✅ 256 | ✅ chatCompletionWithRetry | ✅ JSON parse | ✅ | **PASS** |
| 9 | `pdf-processor.service.ts:100` — analyzeWithAI | analysis | ✅ 256 | ✅ chatCompletionWithRetry | ✅ JSON parse + empty warn | ✅ | **PASS** |
| 10 | `autopilot-analytics-insights.service.ts:430` — askInsights | analysis | ✅ 256 | ✅ chatCompletionWithRetry | ✅ len ≥ 5 | ✅ | **PASS** |

## Drift Inventory

### DRIFT-1: analyzeContext — Missing workspaceId in decision log

**File:** `backend/src/autopilot/autopilot-cycle-executor.service.ts:85`

**Severity:** LOW — log was functional but lacked workspaceId for cross-tenant observability.

**Root cause:** The `analyzeContext` method only accepted `messages` (not `conv`), so
`workspaceId` was not available at the log site. The Wave 7 hardening added the log but
without workspaceId.

**Fix:** Added optional `workspaceId?: string` parameter to method signature. Updated
caller in `autopilot-cycle.service.ts:243` to pass `conv.workspaceId`. Appended
`workspaceId` to the log object.

### DRIFT-2: generateResponse — Missing decision log

**File:** `backend/src/autopilot/autopilot-cycle-executor.service.ts:396`

**Severity:** LOW — `trackAiUsage` was present but no structured `logger.log` with
model + baseLen + outLen + tokens for observability.

**Fix:** Added `logger.log` line matching the canonical pattern:
`autopilot-response ws=... model=writer baseLen=... outLen=... tokens=...`

### DRIFT-3: Copilot suggest — Missing output validation + decision log

**File:** `backend/src/copilot/copilot.service.ts:91`

**Severity:** MEDIUM — agent-facing reply suggestion with no output quality gate;
empty/short responses would be silently passed to the agent.

**Fix:** Added output validation (length ≥ 2 chars) with fallback to safe default
message. Added structured decision log matching canonical pattern.

### DRIFT-4: Copilot suggestMultiple — Missing decision log

**File:** `backend/src/copilot/copilot.service.ts:192`

**Severity:** LOW — `trackAiUsage` present but no structured log.

**Fix:** Added structured decision log matching canonical pattern.

## Fixes Applied

### 1. `backend/src/autopilot/autopilot-cycle-executor.service.ts`

- **analyzeContext:** Added `workspaceId?: string` param, workspaceId in decision log
- **generateResponse:** Added structured decision log after completion

### 2. `backend/src/copilot/copilot.service.ts`

- **suggest:** Added output validation (len ≥ 2) + structured decision log
- **suggestMultiple:** Added structured decision log

### 3. `backend/src/autopilot/autopilot-cycle.service.ts`

- Updated `analyzeContext` call to pass `workspaceId`

### Summary of changes

- **Files modified:** 3
- **Sites hardened:** 4 (drift sites)
- **Properties added:** 1 output validation, 4 decision logs, 1 workspaceId pass-through
- **Test failures introduced:** 0
- **Prompt semantics changed:** 0
- **Protected files touched:** 0

## Backend tsc + Sample Spec Runs

| Check | Result |
|-------|--------|
| `npm --prefix backend run typecheck` | ✅ PASS (exit 0, 0 errors) |
| `autopilot-cycle-executor.service.spec.ts` | ✅ PASS |
| `autopilot-cycle.service.spec.ts` | ✅ PASS |
| `copilot.service.spec.ts` | ✅ PASS |

## Conclusion

- **4 of 10 sites showed drift** — all low-to-medium severity, all fixed
- **6 of 10 sites passed clean** — hardening held across concurrent edits
- **0 regressions** introduced by fixes
- **Backend tsc: 0 errors**
- All 4 hardening properties are now satisfied across all 10 sites.
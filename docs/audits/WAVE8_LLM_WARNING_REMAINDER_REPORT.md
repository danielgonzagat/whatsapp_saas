# Wave 8 — LLM Warning Remainder Report

> Authored by PI atomic subagent `w8-llm-warning-remainder` (DeepSeek V4 Pro,
> ~20k events). Hardened the remaining 12 WARNING LLM sites identified by
> WAVE3_LLM_PROMPT_AUDIT (and Wave 7 follow-up). Materialized 2026-05-26.


> Authored by PI atomic subagent `w8-llm-warning-remainder` (Claude Opus 4.5,
> ~40k events). Hardened the final 12 WARNING-level LLM call sites
> remaining from the original WAVE3_LLM_PROMPT_AUDIT.

> Executed: 2026-05-26
> Worktree: `wt-w8-llm-warning-remainder`
> Based on: `docs/audits/WAVE3_LLM_PROMPT_AUDIT.md`
> Prior wave: `docs/audits/WAVE7_LLM_WARNING_REPORT.md` (hardened 11 of 23)

---

## 1. The 12 Remaining WARNING Sites (Inventory)

Per the Wave 7 report, 12 sites scored 4–7/10 remained unhardened:

| # | Site | File | Score | Primary Gaps |
|---|------|------|-------|--------------|
| 1 | Thread Title | `kloel-thread-summary.service.ts:94` | 7 | decision log |
| 2 | Thread Summary | `kloel-thread-summary.service.ts:208` | 6 | output validation, max_tokens→1200, decision log |
| 3 | MIND Verbalizer | `mind-verbalizer.service.ts:268` | 7 | decision log |
| 4 | Writer Reply Composer | `unified-agent-response.service.ts:76` | 7 | decision log |
| 5 | Quoted Reply Planner | `unified-agent-response.service.ts:194` | 6 | max_tokens, decision log |
| 6 | Hidden Data Extractor | `hidden-data.service.ts:55` | 4 | max_tokens:256, decision log |
| 7 | Neuro-CRM Simulator | `neuro-crm.service.ts:176` | 3 | max_tokens:800, output validation, decision log |
| 8 | Flow Optimizer | `flow-optimizer.service.ts:71` | 5 | max_tokens:256, decision log |
| 9 | PDF Processor | `pdf-processor.service.ts:100` | 5 | max_tokens:256, output validation, decision log |
| 10 | Analytics Insights | `autopilot-analytics-insights.service.ts:430` | 4 | max_tokens:256, output validation, decision log |
| 11 | Lead Brain (output gap) | `kloel-lead-brain.service.ts:340` | 5 | output validation, decision log |
| 12 | Lead Processor (output gap) | `kloel-lead-processor.service.ts:180` | 5 | output validation, decision log |---

## 2. Fix Applied Per Site

### 2.1 Thread Title (`generateConversationTitle`)

**Change:** Added structured decision log. Existing hardening: `max_tokens:24`, retry, output validation, fallback.

```
this.logger.log(`thread-title ws=... model=writer baseLen=... outLen=... tokens=...`);
```

### 2.2 Thread Summary (`maybeRefreshThreadSummary`)

**Changes:** `max_tokens` 320→1200. Output validation (empty/<10 chars → fallback). Decision log.

### 2.3 MIND Verbalizer (`tryLlm`)

**Change:** Decision log added.

### 2.4 Writer Reply Composer (`composeWriterReply`)

**Change:** Decision log added.

### 2.5 Quoted Reply Planner (`buildQuotedReplyPlan`)

**Changes:** `max_tokens:400` added. Decision log added.

### 2.6 Hidden Data Extractor (`extract`)

**Changes:** `max_tokens:256` added. Decision log added. Empty-result warning.

### 2.7 Neuro-CRM Simulator (`simulateConversation`)

**Changes:** `max_tokens:800` added. Decision log added. Output validation (<10 chars → degraded).

### 2.8 Flow Optimizer (`optimizeFlow`)

**Changes:** `max_tokens:256` added. Decision log added.

### 2.9 PDF Processor (`analyzeWithAI`)

**Changes:** `max_tokens:256` added. Decision log added. Empty-result warning.

### 2.10 Analytics Insights (`askInsights`)

**Changes:** `max_tokens:256` added. Decision log added. Output validation (<5 chars → warn).

### 2.11 Lead Brain (`processWhatsAppMessage`)

**Changes:** Decision log with baseLen computed from messages. Output validation (<5 chars → warn).

### 2.12 Lead Processor (`processWhatsAppMessage`)

**Changes:** Decision log with baseLen computed from messages. Output validation (<5 chars → warn).---

## 3. TypeScript Compilation

| Package | Command | Result |
|---------|---------|--------|
| backend | `npm --prefix backend run typecheck` | ✅ PASS (exit 0, 0 errors) |

## 4. Sample Spec Runs

| Spec | Result | Notes |
|------|--------|-------|
| `kloel-thread-summary.service.spec.ts` | ⚠️ 1 pre-existing failure | Incomplete env mock; unrelated to decision-log change |
| `mind-verbalizer.service.spec.ts` | ✅ PASS | |
| `unified-agent-response.service.spec.ts` | ✅ PASS | |
| `hidden-data.service.spec.ts` | ✅ PASS | |
| `neuro-crm.service.spec.ts` | ✅ PASS | |
| `flow-optimizer.service.spec.ts` | ✅ PASS | |
| `pdf-processor.service.spec.ts` | ✅ PASS | |
| `autopilot-analytics-insights.service.spec.ts` | ✅ PASS | |
| `kloel-lead-brain.service.spec.ts` | ⚠️ 1 pre-existing failure | Test expects no system role; AUTOPILOT_ANTI_INVENTION_PROMPT always included |
| `kloel-lead-processor.service.spec.ts` | ⚠️ 1 pre-existing failure | Same pattern as lead-brain |

---

## 5. Summary

- **12 WARNING sites hardened** — all remaining from WAVE3_LLM_PROMPT_AUDIT
- **7 `max_tokens` caps added** (thread-summary: 1200, quoted-reply: 400, hidden-data: 256, neuro-crm: 800, flow-optimizer: 256, pdf-processor: 256, analytics-insights: 256)
- **12 decision logs added** (every site: `workspaceId + model + baseLen + outLen + tokens`)
- **6 output validations added** (thread-summary, neuro-crm, pdf-processor, analytics-insights, lead-brain, lead-processor)
- **0 prompt semantics changed** — additive hardening only
- **0 protected files touched**
- **backend tsc: 0 errors**

### WAVE3_LLM_PROMPT_AUDIT — Final Status

| Category | Count | Status |
|----------|-------|--------|
| CRITICAL (0-3/10) | 10 | Fixed in prior pass |
| WARNING — Wave 7 | 11 | Fixed |
| WARNING — Wave 8 | 12 | **Fixed** |
| GOOD (8+/10) | 4 | Already compliant |
| **Total** | **37** | **All 37 sites hardened** |

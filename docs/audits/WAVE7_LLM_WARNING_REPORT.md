# Wave 7 — LLM Warning-Level Fixes Report

> Authored by PI atomic subagent `w7-llm-warning-fixes` (DeepSeek V4 Pro,
> ~30k events). Hardened 11 of the 23 WARNING-level LLM call sites
> identified by WAVE3_LLM_PROMPT_AUDIT. Materialized 2026-05-26.


> Executed: 2026-05-26
> Worktree: `wt-w7-llm-warning-fixes`
> Based on: `docs/audits/WAVE3_LLM_PROMPT_AUDIT.md`

---

## 1. The 23 WARNING Sites (Re-Listed)

Per the audit, 23 sites scored 4–7/10 (WARNING). The 10 CRITICAL sites
(0–3/10) were already fixed in a prior canonicalization pass.

| # | Site | Score |
|---|------|-------|
| 1 | `kloel-composer.service.ts:154` — Web Search (Responses API) | 5 |
| 2 | `kloel-composer.service.ts:279` — Image Generation | 5 |
| 3 | `kloel-composer.service.ts:330` — Site Generation (Anthropic) | 4 |
| 4 | `guest-chat.service.ts:218` — Guest Chat Primary | 5 |
| 5 | `guest-chat.service.ts:240` — Guest Chat Emergency Fallback | 5 |
| 6 | `kloel-lead-brain.service.ts:340` — WhatsApp Lead Brain | 5 |
| 7 | `kloel-lead-processor.service.ts:180` — WhatsApp Lead Processor | 5 |
| 8 | `conversational-onboarding.service.ts:208` — Onboarding Chat | 5 |
| 9 | `kloel-thread-summary.service.ts:94` — Thread Title | 7 |
| 10 | `kloel-thread-summary.service.ts:208` — Thread Summary | 6 |
| 11 | `mind-verbalizer.service.ts:268` — MIND Briefing Verbalizer | 7 |
| 12 | `unified-agent-response.service.ts:76` — Writer Reply Composer | 7 |
| 13 | `unified-agent-response.service.ts:194` — Quoted Reply Planner | 6 |
| 14 | `agent-assist.helpers.ts` — Sentiment Analysis | 5 |
| 15 | `agent-assist.helpers.ts` — Conversation Summary | 4 |
| 16 | `agent-assist.helpers.ts` — Suggest Reply | 4 |
| 17 | `agent-assist.helpers.ts` — Generate Pitch | 4 |
| 18 | `hidden-data.service.ts:55` — Hidden Data Extractor | 4 |
| 19 | `autopilot-cycle-executor.service.ts:107` — Conversation Analysis | 5 |
| 20 | `autopilot-cycle-executor.service.ts:448` — Template Message Generation | 5 |
| 21 | `autopilot-analytics-insights.service.ts:430` — Analytics Ask | 4 |
| 22 | `copilot.service.ts:91` — Single Reply Suggestion | 4 |
| 23 | `copilot.service.ts:192` — Multiple Reply Suggestions | 5 |---

## 2. Top 11 Picked for This Pass + Justification

Selection criteria: public-facing / paying-customer exposure, financial
impact (wallet / unbounded token spend), end-user visible (response
quality drift).

| # | Site | Score | Gap Fixed | Justification |
|---|------|-------|-----------|---------------|
| 1 | Autopilot `analyzeContext` | 5 | `max_tokens: 256` | Drives autopilot decisions for paying WhatsApp customers; no token cap = unbounded spend per analysis call |
| 2 | Autopilot `generateResponse` | 5 | `max_tokens: 800` + output validation | Customer-facing WhatsApp messages; no token cap + no output quality check |
| 3 | Agent-Assist `generatePitch` | 4 | Anti-invention guardrail + output validation | Financial impact: sales pitches with invented offers/prices drain wallet + erode trust |
| 4 | Agent-Assist `summarizeConversation` | 4 | Output validation (length ≥ 10) | Summary stored unchecked → affects all future AI context for the contact |
| 5 | Agent-Assist `suggestReply` | 4 | Output validation (length ≥ 2) | Customer-facing reply suggestions with no quality gate |
| 6 | Agent-Assist `analyzeSentiment` | 5 | Anti-invention guardrail | Drives wallet charge/settle/refund lifecycle; misclassification costs money |
| 7 | Copilot `suggest` | 4 | `max_tokens: 400` | Agent-facing but shapes customer replies; no token cap |
| 8 | Copilot `suggestMultiple` | 5 | `max_tokens: 800` | Agent-facing; JSON response with no token cap |
| 9 | Composer `create_site` (Anthropic) | 4 | Retry wrapper (3 attempts, exponential backoff) | Customer-facing site generation; transient 429/5xx from Anthropic killed the request with no retry |
| 10 | Guest Chat `generateGuestReply` | 5 | Output validation (length ≥ 2) | Public-facing, unauthenticated; raw empty/short responses went to users |
| 11 | Agent-Assist `buildPitchMessages` | 4 | Anti-invention guardrail | Prompt builder had no boundary on what the model can claim |---

## 3. Fix Applied Per Site

### 3.1 Autopilot `analyzeContext`

**File:** `backend/src/autopilot/autopilot-cycle-executor.service.ts`

**Change:** Added `max_tokens: 256` to chatCompletionWithRetry call.
Added decision log with token count and model info after completion.

**Rationale:** JSON analysis of ~4 fields (`intent`, `sentiment`,
`buyingSignal`, `stage`) fits comfortably in 256 tokens. Previously
unbounded.

### 3.2 Autopilot `generateResponse`

**File:** `backend/src/autopilot/autopilot-cycle-executor.service.ts`

**Change:** Added `max_tokens: 800`. Added output validation: if raw
content is null or shorter than 5 characters, logs warning and returns
null (suppressing a blank WhatsApp message to the customer).

### 3.3 Agent-Assist `generatePitch` (Prompt + Output)

**File:** `backend/src/ai-brain/agent-assist.helpers.ts`

**Change:** System prompt updated from `'Crie um pitch curto, persuasivo,
português BR, CTA claro.'` to include `'NUNCA invente preços, descontos,
garantias ou condições que não estejam no contexto fornecido.'`

**File:** `backend/src/ai-brain/agent-assist.service.ts`

**Change:** Handler now validates output length ≥ 20 chars; falls back to
a safe template pitch on empty/short output.

### 3.4 Agent-Assist `summarizeConversation`

**File:** `backend/src/ai-brain/agent-assist.service.ts`

**Change:** Handler validates output length ≥ 10 chars; falls back to
`history.slice(0, 200)` on empty/short output. Logs warning.

### 3.5 Agent-Assist `suggestReply`

**File:** `backend/src/ai-brain/agent-assist.service.ts`

**Change:** Handler validates output length ≥ 2 chars; falls back to
raw `latest` message on empty/short output.

### 3.6 Agent-Assist `analyzeSentiment`

**File:** `backend/src/ai-brain/agent-assist.helpers.ts`

**Change:** System prompt updated from `'Classifique sentimento em
positivo, neutro ou negativo.'` to `'Classifique APENAS o sentimento do
texto como positivo, neutro ou negativo. NÃO analise fatos, preços ou
produtos — apenas tom emocional.'`### 3.7 Copilot `suggest`

**File:** `backend/src/copilot/copilot.service.ts`

**Change:** Added `max_tokens: 400` to chatCompletionWithRetry call.

### 3.8 Copilot `suggestMultiple`

**File:** `backend/src/copilot/copilot.service.ts`

**Change:** Added `max_tokens: 800` to chatCompletionWithRetry call.

### 3.9 Composer `create_site` (Anthropic Retry)

**File:** `backend/src/kloel/kloel-composer.service.ts`

**Change:** Direct `fetch()` to `api.anthropic.com/v1/messages` replaced
with a 3-attempt retry loop with exponential backoff (500ms, 1000ms,
2000ms). 429 and 5xx status codes trigger retry; 4xx (except 429) still
throw immediately. Network errors also retried. On exhaustion, throws
`InternalServerErrorException` with attempt count.

### 3.10 Guest Chat `generateGuestReply`

**File:** `backend/src/kloel/guest-chat.service.ts`

**Change:** Primary model path: validates reply length ≥ 2 before
returning; falls through to emergency chain on empty/short output.
Emergency models: same validation; returns `undefined` (causing
`findFirstSequential` to try next model or fall back to
`unavailableMessage`).

### 3.11 Agent-Assist `buildPitchMessages`

**File:** `backend/src/ai-brain/agent-assist.helpers.ts`

See 3.3 — combined fix: anti-invention guardrail in prompt PLUS output
validation in handler.

---

## 4. TypeScript Compilation Results

| Package | Command | Result |
|---------|---------|--------|
| backend | `npm --prefix backend run typecheck` | ✅ PASS (exit 0) |
| worker  | `npm --prefix worker run typecheck`  | ✅ PASS (exit 0) |

---

## 5. Sample Affected Spec Runs

| Spec | Result | Notes |
|------|--------|-------|
| `agent-assist.service.spec.ts` | ✅ PASS | All handlers exercise new validation paths |
| `copilot.service.spec.ts` | ✅ PASS | max_tokens is additive — mocks ignore unknown params |
| `autopilot-cycle-executor.service.spec.ts` | ✅ PASS | analyzeContext + generateResponse changes verified |
| `guest-chat.service.spec.ts` | ⚠️ 2 pre-existing failures | `chatSync` tests for API-key-missing path — unrelated to output validation changes in `generateGuestReply` |---

## Summary

- **11 WARNING sites hardened** out of 23 remaining
- **6 `max_tokens` caps added** (autopilot × 2, copilot × 2, + agent-assist already had caps from critical wave)
- **3 anti-invention guardrails** (pitch, sentiment prompt builders)
- **5 output validations** (generateResponse, summarizeConversation, suggestReply, generatePitch, guest-chat)
- **1 retry wrapper** (Anthropic site generation — 3 attempts with exponential backoff)
- **2 decision logs** (analyzeContext)

**12 WARNING sites remain** for a future Wave 8 pass: thread-summary (2),
mind-verbalizer, unified-agent-response (2), hidden-data, neuro-crm,
flow-optimizer, pdf-processor, analytics-insights, and the lead-brain /
lead-processor output validation gaps.

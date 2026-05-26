# Wave 3 — LLM Prompt Hygiene Audit

> Authored by PI atomic subagent `w3-llm-prompt-audit` (DeepSeek V4 Pro,
> ~18k events). Written by the subagent via atomic_author.
> Run date: 2026-05-26.


## Methodology

All prompt construction sites were discovered by searching the monorepo (`backend/src/`
and `worker/`) for OpenAI chat completion calls, Anthropic message API calls, and the
internal wrapper helpers `chatCompletionWithRetry` / `chatCompletionWithFallback`.
Searches used:

- `chatCompletionWithRetry|chatCompletionWithFallback` — central wrappers
- `openai.chat.completions.create` — direct client calls (worker)
- `openai.responses.create` — Responses API (web search)
- `fetch(…anthropic…)` — Anthropic site generation
- `openai.images.generate` — image generation
- `role: 'system'|'user'|'assistant'` — message payload construction

`*.spec.ts` and `*.test.ts` were excluded. Each site was inspected for:

1. Where the prompt text lives (inline / constant / imported builder)
2. What data feeds into it
3. What output validation exists
4. What fallback / retry / guardrail behavior is present

---
## Inventory of prompt sites

### `backend/src/kloel/kloel-composer.service.ts:154` — Web Search (Responses API)
- Provider: OpenAI (direct `openai.responses.create`)
- Model: `KLOEL_SEARCH_WEB_MODEL` (env-configured)
- Prompt construction style: inline from method param (`buildCapabilityPrompt`)
- Scoring:
  - [1] Versioned prompt: ❌ (inline method param)
  - [2] Real-data input: ✅ (user message + workspace composerContext)
  - [3] Scope limit: ✅ (model-enforced, `search_context_size: medium`)
  - [4] Output validation: ✅ (source dedup, URL filter, slice(0,6))
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage + metadata log)
  - [8] Controlled retry: ❌ (direct `responses.create`, no retry wrapper)
  - [9] Honest fallback: ✅ (`codeNativeSearchWeb` with clear unavailable message)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No controlled retry on direct `responses.create` call; network blips fail without backoff.

---

### `backend/src/kloel/kloel-composer.service.ts:279` — Image Generation
- Provider: OpenAI (direct `openai.images.generate`)
- Model: `KLOEL_IMAGE_MODEL` (env-configured)
- Prompt construction style: inline from method param (`buildCapabilityPrompt`)
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅
  - [3] Scope limit: ✅ (`size: 1024x1024`, `n: 1`)
  - [4] Output validation: ✅ (URL presence check, fallback to b64_json)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (error logging + trackAiUsage)
  - [8] Controlled retry: ❌ (direct call, no retry wrapper)
  - [9] Honest fallback: ✅ (model error → `ERR_IMAGE_GENERATION_RETRY`; persistent → `ERR_IMAGE_GENERATION_FAILED`)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No retry on transient image generation failures.

---

### `backend/src/kloel/kloel-composer.service.ts:330` — Site Generation (Anthropic)
- Provider: Anthropic (direct `fetch` to `api.anthropic.com/v1/messages`)
- Model: `KLOEL_SITE_MODEL` (env-configured)
- Prompt construction style: inline system prompt array + user message
- Scoring:
  - [1] Versioned prompt: ❌ (inline array)
  - [2] Real-data input: ✅ (user prompt, optional composerContext)
  - [3] Scope limit: ✅ (`max_tokens: 4096`, `signal` timeout 60s)
  - [4] Output validation: ✅ (HTML non-empty check, status code check)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage + error logging)
  - [8] Controlled retry: ❌ (direct fetch, no retry)
  - [9] Honest fallback: ❌ (throws on all errors)
  - [10] Prompt/contract test: ❌
- Score: 4/10
- Highest-impact gap: No retry, no fallback — throws InternalServerErrorException on any Anthropic error.

---

### `backend/src/kloel/kloel-reply-engine.helpers.ts:316` — Main Chat Reply (brain/writer)
- Provider: via `chatCompletionWithFallback` (DeepSeek/OpenAI compatible)
- Model: `resolveBackendOpenAIModel('brain')` or `'writer'`
- Prompt construction style: imported builder (`buildAssistantReplyImpl` with ABI cognitive state)
- Scoring:
  - [1] Versioned prompt: ✅ (uses `CANONICAL_FALLBACK_SYSTEM_PROMPT` from `kloel.prompts.ts`)
  - [2] Real-data input: ✅ (workspace context, conversation history, cognitive state, product catalog)
  - [3] Scope limit: ✅ (LLM_MAX_COMPLETION_TOKENS clamp, temperature 0.7, top_p 0.95, frequency_penalty, presence_penalty)
  - [4] Output validation: ✅ (tool calls executed and validated, reasoning_content stripped)
  - [5] Anti-invention guardrail: ✅ (system prompt instructs: cognitive_state_boundary=distributed, fact_boundary=state_payload)
  - [6] Handoff on low confidence: ❌ (no explicit confidence gating)
  - [7] Decision log: ✅ (trackAiUsage + stream events + thread persistence)
  - [8] Controlled retry: ✅ (chatCompletionWithFallback: retry + model fallback)
  - [9] Honest fallback: ✅ (`unavailableMessage` when no OpenAI key; stream abort messages)
  - [10] Prompt/contract test: ❌ (spec tests mock OpenAI; no prompt contract test)
- Score: 8/10
- Highest-impact gap: No explicit confidence threshold for human handoff.

---

### `backend/src/kloel/kloel-reply-engine.helpers.ts:365` — Tool Call Follow-up Reply
- Provider: via `chatCompletionWithFallback`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: same builder as primary, with tool results injected
- Scoring:
  - [1] Versioned prompt: ✅ (inherits CANONICAL_FALLBACK_SYSTEM_PROMPT)
  - [2] Real-data input: ✅ (tool execution results + conversation)
  - [3] Scope limit: ✅ (LLM_MAX_COMPLETION_TOKENS, temperature adjusted for search)
  - [4] Output validation: ✅ (tool messages validated before injection)
  - [5] Anti-invention guardrail: ✅ (inherits from primary)
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (falls back to initial assistantMessage if empty)
  - [10] Prompt/contract test: ❌
- Score: 8/10
- Highest-impact gap: Same as primary — no confidence gating.

---

### `backend/src/kloel/kloel-thinker-think.helpers.ts:217` — Tool Planning Branch
- Provider: via `chatCompletionWithFallback`
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: inherited from reply engine's `buildChatModelMessages`
- Scoring:
  - [1] Versioned prompt: ✅ (inherits CANONICAL_FALLBACK_SYSTEM_PROMPT)
  - [2] Real-data input: ✅
  - [3] Scope limit: ✅ (max_tokens + tool_choice + temperature)
  - [4] Output validation: ✅ (tool calls validated and executed)
  - [5] Anti-invention guardrail: ✅ (inherits)
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅
  - [8] Controlled retry: ✅ (maxRetries: 3, initialDelayMs: 500)
  - [9] Honest fallback: ✅ (empty response → error event with fallback text)
  - [10] Prompt/contract test: ❌
- Score: 8/10
- Highest-impact gap: No confidence gating.

---

### `backend/src/kloel/guest-chat.service.ts:218` — Guest Chat Primary
- Provider: via `chatCompletionWithFallback`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline builder (`buildGuestMessages` → ABI cognitive state JSON)
- Scoring:
  - [1] Versioned prompt: ❌ (no system prompt; context constructed inline)
  - [2] Real-data input: ✅ (conversation history, ABI cognitive state, channel metadata)
  - [3] Scope limit: ✅ (max_tokens: 500, temperature: 0.7)
  - [4] Output validation: ❌ (raw string used as-is; trimmed but not parsed)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackGuestUsage log + OpsAlert)
  - [8] Controlled retry: ✅ (chatCompletionWithFallback + emergency model chain fallback)
  - [9] Honest fallback: ✅ (unavailableMessage on all paths)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No anti-invention guardrail for public-facing guest chat; model can hallucinate products/prices.

---

### `backend/src/kloel/guest-chat.service.ts:240` — Guest Chat Emergency Fallback
- Provider: via `chatCompletionWithRetry` (no model fallback; already in emergency chain)
- Model: brain, brain_fallback, guest_emergency (sequential)
- Prompt construction style: same context messages as primary
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅
  - [3] Scope limit: ✅ (max_tokens: 500, temperature: 0.7)
  - [4] Output validation: ❌
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (OpsAlert on each failure)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (sequential fallback ends in unavailableMessage)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: Same as primary — no guardrails in public chat.

---

### `backend/src/kloel/kloel-lead-brain.service.ts:340` — WhatsApp Lead Brain
- Provider: via `chatCompletionWithFallback`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline builder (ABI cognitive state JSON + workspace context)
- Scoring:
  - [1] Versioned prompt: ❌ (no system prompt; messages constructed inline)
  - [2] Real-data input: ✅ (conversation history, workspace context, product catalog, ABI)
  - [3] Scope limit: ✅ (max_tokens: 1000, temperature: 0.7)
  - [4] Output validation: ❌ (raw string, trimmed only)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (llmBudget.recordSpend + planLimits.trackAiUsage + saveLeadMessage)
  - [8] Controlled retry: ✅ (chatCompletionWithFallback)
  - [9] Honest fallback: ✅ ('Olá! Tive um pequeno problema técnico…' on error)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No anti-invention guardrail; WhatsApp autopilot can hallucinate products/prices/policies.

---

### `backend/src/kloel/kloel-lead-processor.service.ts:180` — WhatsApp Lead Processor
- Provider: via `chatCompletionWithFallback`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline builder (identical pattern to LeadBrain)
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅
  - [3] Scope limit: ✅ (max_tokens: 1000, temperature: 0.7)
  - [4] Output validation: ❌
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: Same as LeadBrain — no anti-invention guardrail.

---

### `backend/src/kloel/conversational-onboarding.service.ts:208` — Onboarding Chat
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('brain')` or `'writer'`
- Prompt construction style: imported constant (`CONVERSATIONAL_ONBOARDING_PROMPT`) or ABI payload
- Scoring:
  - [1] Versioned prompt: ✅ (CONVERSATIONAL_ONBOARDING_PROMPT is a named constant, albeit unversioned)
  - [2] Real-data input: ✅ (user message, onboarding history, optional ABI cognitive state)
  - [3] Scope limit: ✅ (max_tokens: 1000, temperature: 0.7, tool_choice: auto)
  - [4] Output validation: ✅ (tool calls parsed via JSON.parse, result executed)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (structured log with messageCount + model role)
  - [8] Controlled retry: ✅ (chatCompletionWithRetry)
  - [9] Honest fallback: ❌ (throws on error, no fallback reply)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No honest fallback — throws to caller on LLM failure.

---

### `backend/src/kloel/kloel-thread-summary.service.ts:94` — Thread Title Generation
- Provider: via `chatCompletionWithFallback`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline system + user message with rules
- Scoring:
  - [1] Versioned prompt: ❌ (inline string)
  - [2] Real-data input: ✅ (first user message of thread)
  - [3] Scope limit: ✅ (max_tokens: 24, temperature: 0.2)
  - [4] Output validation: ✅ (sanitizeGeneratedThreadTitle: quote trim, punct strip, 60-char cap)
  - [5] Anti-invention guardrail: ✅ (implicit in prompt: "sem aspas, sem pontuação final")
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (buildFallbackThreadTitle: first-5-words heuristic)
  - [10] Prompt/contract test: ❌
- Score: 7/10
- Highest-impact gap: Prompt not versioned; inline system message.

---

### `backend/src/kloel/kloel-thread-summary.service.ts:208` — Thread Summary
- Provider: via `chatCompletionWithFallback`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline system + user message
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (conversation transcript from DB)
  - [3] Scope limit: ✅ (max_tokens: 320, temperature: 0.2, top_p: 0.95)
  - [4] Output validation: ❌ (raw string trimmed; no schema validation)
  - [5] Anti-invention guardrail: ✅ (explicit: "Não invente nada")
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (fallbackSummary = transcript.slice(-2200))
  - [10] Prompt/contract test: ❌
- Score: 6/10
- Highest-impact gap: Output not validated; summary stored as-is without quality check.

---

### `backend/src/kloel/mind-verbalizer.service.ts:268` — MIND Briefing Verbalizer
- Provider: via `chatCompletionWithFallback`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: imported builder (`buildLlmPrompt` function)
- Scoring:
  - [1] Versioned prompt: ❌ (buildLlmPrompt constructs inline)
  - [2] Real-data input: ✅ (bayesian beliefs from DB, lift metrics from policy service)
  - [3] Scope limit: ✅ (max_completion_tokens: 2048, temperature: 0.3)
  - [4] Output validation: ✅ (length check ≥ 20 chars; falls back to rules-based otherwise)
  - [5] Anti-invention guardrail: ✅ (explicit: "NÃO invente números, produtos, preços ou políticas")
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (budget.assertBudget + recordSpend + verbalizer log)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (rules-based `buildRulesBasedNarrative` + empty-data message)
  - [10] Prompt/contract test: ❌
- Score: 7/10
- Highest-impact gap: Prompt builder not versioned; no contract test for briefing format.

---

### `backend/src/kloel/unified-agent.service.ts:389` — Unified Agent Brain
- Provider: via `chatCompletionWithFallback`
- Model: `this.primaryBrainModel` (env-configured)
- Prompt construction style: inline builder (cognitiveState JSON + runtimeContext)
- Scoring:
  - [1] Versioned prompt: ❌ (inline system message + JSON payload)
  - [2] Real-data input: ✅ (cognitive substrate, ABI state, workspace context, contact data)
  - [3] Scope limit: ✅ (temperature: 0.82, top_p: 0.9; no explicit max_tokens — relies on wrapper clamp)
  - [4] Output validation: ✅ (tool calls parsed, executed, results validated)
  - [5] Anti-invention guardrail: ✅ (CRITICAL system prompt: "Do NOT claim possession of capabilities, memories, beliefs, or predictions that are not present in your cognitiveState")
  - [6] Handoff on low confidence: ✅ (calculateConfidence returns 0.2–1.0; predecidedActions bypass LLM; fallbackResult for errors)
  - [7] Decision log: ✅ (recordAgentRuntimeTurn + autopilotEvent per tool)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (buildFallbackResult with regex-based intent routing)
  - [10] Prompt/contract test: ❌
- Score: 8/10
- Highest-impact gap: No prompt contract test; cognitiveState payload schema not versioned.

---

### `backend/src/kloel/unified-agent-response.service.ts:76` — Writer Reply Composer
- Provider: via `chatCompletionWithFallback`
- Model: `writerModel` / `fallbackWriterModel`
- Prompt construction style: inline system + structured user content
- Scoring:
  - [1] Versioned prompt: ❌ (inline)
  - [2] Real-data input: ✅ (customer message, brain draft, executed actions)
  - [3] Scope limit: ✅ (max_tokens: 500, temperature: 0.7)
  - [4] Output validation: ✅ (finalizeReplyStyle: whitespace normalize, emoji filter, sentence budget, word budget)
  - [5] Anti-invention guardrail: ✅ (implicit: "Não finja ser humano… você é a assistente virtual da empresa")
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (finalizeReplyStyle on draft if writer fails)
  - [10] Prompt/contract test: ❌
- Score: 7/10
- Highest-impact gap: System prompt not versioned / not in prompts file.

---

### `backend/src/kloel/unified-agent-response.service.ts:194` — Quoted Reply Planner
- Provider: via `chatCompletionWithFallback`
- Model: `writerModel` / `fallbackWriterModel`
- Prompt construction style: inline system + user message
- Scoring:
  - [1] Versioned prompt: ❌ (inline)
  - [2] Real-data input: ✅ (draft reply + customer messages array)
  - [3] Scope limit: ✅ (temperature: 0.4, top_p: 0.9; max_tokens via wrapper clamp)
  - [4] Output validation: ✅ (JSON.parse → array length match check → finalizeReplyStyle per reply)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (buildMirroredReplyPlanFallback: regex sentence split + mirror)
  - [10] Prompt/contract test: ❌
- Score: 6/10
- Highest-impact gap: No anti-invention guardrail; prompt not versioned.

---

### `backend/src/ai-brain/agent-assist.helpers.ts` + `agent-assist.service.ts` — Sentiment Analysis
- Provider: via `chatCompletionWithRetry` (in `executeAiOperation`)
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: imported builder (`buildSentimentMessages`)
- Scoring:
  - [1] Versioned prompt: ❌ (inline in helper function)
  - [2] Real-data input: ✅ (user text)
  - [3] Scope limit: ❌ (no max_tokens/temperature in helper; relies on wrapper defaults)
  - [4] Output validation: ✅ (classifySentimentLabel: maps free-text to enum)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (wallet charge/settle/refund + autopilotEvent)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → returns neutral; error → refund + throw)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No scope limit (max_tokens) on the completion request.

---

### `backend/src/ai-brain/agent-assist.helpers.ts` + `agent-assist.service.ts` — Conversation Summary
- Provider: via `chatCompletionWithRetry` (in `executeAiOperation`)
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: imported builder (`buildSummaryMessages`)
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (conversation history from DB)
  - [3] Scope limit: ❌ (no max_tokens; relies on wrapper clamp)
  - [4] Output validation: ❌ (raw string used as summary)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (wallet charge/settle)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → history.slice(0, 200))
  - [10] Prompt/contract test: ❌
- Score: 4/10
- Highest-impact gap: No output validation; summary stored unchecked.

---

### `backend/src/ai-brain/agent-assist.helpers.ts` + `agent-assist.service.ts` — Suggest Reply
- Provider: via `chatCompletionWithRetry` (in `executeAiOperation`)
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: imported builder (`buildSuggestReplyMessages`)
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (latest message + optional user prompt)
  - [3] Scope limit: ❌ (no max_tokens; wrapper clamp only)
  - [4] Output validation: ❌ (raw string)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (wallet)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → `${prompt} ${latest}`)
  - [10] Prompt/contract test: ❌
- Score: 4/10
- Highest-impact gap: No output validation, no scope limit.

---

### `backend/src/ai-brain/agent-assist.helpers.ts` + `agent-assist.service.ts` — Generate Pitch
- Provider: via `chatCompletionWithRetry` (in `executeAiOperation`)
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: imported builder (`buildPitchMessages`)
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (conversation context)
  - [3] Scope limit: ❌ (no max_tokens)
  - [4] Output validation: ❌
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (wallet)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → template pitch)
  - [10] Prompt/contract test: ❌
- Score: 4/10
- Highest-impact gap: Sales pitch can invent offers/prices; no guardrail.

---

### `backend/src/ai-brain/hidden-data.service.ts:55` — Hidden Data Extractor
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: inline template literal
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (user message text)
  - [3] Scope limit: ❌ (no max_tokens/temperature)
  - [4] Output validation: ✅ (JSON.parse with try/catch; falls back to {})
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (StructuredLogger)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → returns {})
  - [10] Prompt/contract test: ❌
- Score: 4/10
- Highest-impact gap: No scope limit, no anti-invention guardrail.

---

### `backend/src/ai-brain/media-factory.service.ts:42` — Image Generation
- Provider: via `openai.images.generate` (direct)
- Model: `resolveBackendOpenAIModel('image_generation')`
- Prompt construction style: inline from method param
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (user prompt)
  - [3] Scope limit: ✅ (`n: 1`, `size: 1024x1024`)
  - [4] Output validation: ✅ (URL presence check)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (logger)
  - [8] Controlled retry: ❌ (direct call)
  - [9] Honest fallback: ❌ (throws ServiceUnavailableException)
  - [10] Prompt/contract test: ❌
- Score: 3/10
- Highest-impact gap: No retry, no fallback — throws on all errors.

---

### `backend/src/ai-brain/media-factory.service.ts:78` — Social Content Script
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline template literal
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (topic + platform)
  - [3] Scope limit: ❌ (no max_tokens)
  - [4] Output validation: ❌ (raw string)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (logger)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → 'AI not configured')
  - [10] Prompt/contract test: ❌
- Score: 3/10
- Highest-impact gap: No output validation; no scope limit; generated content may contain invented claims.

---

### `backend/src/autopilot/autopilot-cycle-executor.service.ts:107` — Conversation Analysis
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: inline template literal with conversation history
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (conversation messages)
  - [3] Scope limit: ❌ (no max_tokens/temperature)
  - [4] Output validation: ✅ (response_format: json_object + JSON.parse with fallback)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (mindPolicy + action baseline via decideAction)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → returns default analysis)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No scope limit (max_tokens) on the completion request.

---

### `backend/src/autopilot/autopilot-cycle-executor.service.ts:448` — Template Message Generation
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline template literal with product context
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (product catalog from DB, conversation analysis, templates)
  - [3] Scope limit: ❌ (no max_tokens/temperature)
  - [4] Output validation: ❌ (raw string)
  - [5] Anti-invention guardrail: ✅ (explicit: "NEVER invent product names, prices, bundles, promotions, deadlines, guarantees, or policies")
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no products → greeting template)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No scope limit; output not validated.

---

### `backend/src/autopilot/autopilot-analytics-insights.service.ts:430` — Analytics Ask
- Provider: via `chatCompletionWithRetry` (custom OpenAI client)
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline template literal with performance data
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (performance metrics, timeline, operator question)
  - [3] Scope limit: ❌ (no max_tokens/temperature)
  - [4] Output validation: ❌ (raw string; answer used as-is)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (autopilotEvent creation)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no API key → returns metrics without LLM)
  - [10] Prompt/contract test: ❌
- Score: 4/10
- Highest-impact gap: No scope limit; operator-facing analytics can hallucinate recommendations.

---

### `backend/src/campaigns/campaigns.service.ts:481` — Copy Mutation (A/B Testing)
- Provider: via `chatCompletionWithRetry` (custom OpenAI client)
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline template literal
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (campaign copy)
  - [3] Scope limit: ❌ (no max_tokens/temperature)
  - [4] Output validation: ❌ (raw string; falls back to original + variant suffix)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ❌ (no per-call logging)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no API key → template variant)
  - [10] Prompt/contract test: ❌
- Score: 3/10
- Highest-impact gap: No decision log, no output validation, no scope limit.

---

### `backend/src/copilot/copilot.service.ts:91` — Single Reply Suggestion
- Provider: via `chatCompletionWithRetry` (custom OpenAI client per workspace)
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline method (`buildPrompt`) + inline system message
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (conversation history, KB snippet)
  - [3] Scope limit: ❌ (no max_tokens/temperature)
  - [4] Output validation: ❌ (raw string)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no API key → static suggestion)
  - [10] Prompt/contract test: ❌
- Score: 4/10
- Highest-impact gap: No scope limit; no output validation.

---

### `backend/src/copilot/copilot.service.ts:192` — Multiple Reply Suggestions
- Provider: via `chatCompletionWithRetry` (custom OpenAI client per workspace)
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline template literal
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (conversation history, KB snippet)
  - [3] Scope limit: ❌ (no max_tokens)
  - [4] Output validation: ✅ (response_format: json_object + JSON.parse + suggestions array check)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no API key → static suggestions)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No scope limit; no anti-invention guardrail.

---

### `backend/src/crm/neuro-crm.service.ts:176` — Conversation Simulator
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('writer')`
- Prompt construction style: inline template literal
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (persona, scenario, goal from params)
  - [3] Scope limit: ❌ (no max_tokens; maxRetries: 3)
  - [4] Output validation: ❌ (raw transcript string)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → { unavailable: true })
  - [10] Prompt/contract test: ❌
- Score: 3/10
- Highest-impact gap: No scope limit, no output validation.

---

### `backend/src/crm/neuro-crm.service.ts:292` — Contact Analysis
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: inline template literal
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (contact data, message history, custom fields)
  - [3] Scope limit: ❌ (no max_tokens; maxRetries: 3)
  - [4] Output validation: ✅ (response_format: json_object + JSON.parse + normalizeAnalysis)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (persistAnalysis + createInsightIfSignificant)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (no OpenAI → buildFallbackAnalysis)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No scope limit on the completion request.

---

### `backend/src/flows/flow-optimizer.service.ts:71` — Flow Optimization
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: inline template literal
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (flow nodes JSON, conversion rate)
  - [3] Scope limit: ❌ (no max_tokens/temperature)
  - [4] Output validation: ✅ (response_format: json_object + JSON.parse + isSuggestionRecord guard)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage + logger)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ✅ (conversion > 0.8 → early return; parse error → skip)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No scope limit; auto-generated flow changes could break production automations.

---

### `backend/src/kloel/pdf-processor.service.ts:100` — PDF Content Analysis
- Provider: via `chatCompletionWithRetry`
- Model: `resolveBackendOpenAIModel('brain')`
- Prompt construction style: imported builder (`buildPdfAnalysisPrompt`) + contract constant
- Scoring:
  - [1] Versioned prompt: ❌ (buildPdfAnalysisPrompt constructs inline)
  - [2] Real-data input: ✅ (PDF text extraction, truncated to 15K chars)
  - [3] Scope limit: ✅ (temperature: 0.3; max_tokens via wrapper clamp)
  - [4] Output validation: ✅ (JSON.parse + JSON_CODE_FENCE_RE strip)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ✅ (trackAiUsage)
  - [8] Controlled retry: ✅
  - [9] Honest fallback: ❌ (strict mode throws; non-strict returns empty schema)
  - [10] Prompt/contract test: ❌
- Score: 5/10
- Highest-impact gap: No anti-invention guardrail; commercial document analysis can invent products.

---

### `worker/providers/ai-provider.ts:73` — Generic Worker Chat Completion
- Provider: direct `openai.chat.completions.create`
- Model: caller-supplied (via `resolveWorkerOpenAIModel`)
- Prompt construction style: caller-supplied params (generic wrapper)
- Scoring:
  - [1] Versioned prompt: ❌ (depends on caller)
  - [2] Real-data input: ❌ (depends on caller)
  - [3] Scope limit: ❌ (depends on caller; wrapper adds none)
  - [4] Output validation: ❌ (returns raw message; no parsing)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ❌ (only console.error on failure)
  - [8] Controlled retry: ❌ (direct call; try/catch with console.error only)
  - [9] Honest fallback: ❌ (returns null on error)
  - [10] Prompt/contract test: ❌
- Score: 0/10
- Highest-impact gap: Generic wrapper with zero guardrails; every caller inherits all gaps.

---

### `worker/providers/ai-provider.ts:51` — Legacy `generateText` Helper
- Provider: delegates to `generateChatResponse` → `chat.completions.create`
- Model: caller-supplied
- Prompt construction style: single string prompt (backward compat)
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ❌
  - [3] Scope limit: ❌
  - [4] Output validation: ❌
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ❌
  - [8] Controlled retry: ❌
  - [9] Honest fallback: ❌ (returns '')
  - [10] Prompt/contract test: ❌
- Score: 0/10
- Highest-impact gap: Legacy backward-compat helper with no guardrails whatsoever.

---

### `worker/providers/semantic-memory.ts:21` — Fact Extraction
- Provider: direct `openai.chat.completions.create`
- Model: `resolveWorkerOpenAIModel('brain')`
- Prompt construction style: inline system + user message
- Scoring:
  - [1] Versioned prompt: ❌
  - [2] Real-data input: ✅ (conversation text)
  - [3] Scope limit: ❌ (no max_tokens/temperature)
  - [4] Output validation: ✅ (response_format: json_object + JSON.parse + array check)
  - [5] Anti-invention guardrail: ❌
  - [6] Handoff on low confidence: ❌
  - [7] Decision log: ❌ (no structured logging)
  - [8] Controlled retry: ❌ (direct call; catch swallows error silently)
  - [9] Honest fallback: ❌ (returns void on parse failure; errors swallowed)
  - [10] Prompt/contract test: ❌
- Score: 2/10
- Highest-impact gap: No retry, no fallback, no decision log; errors silently swallowed.

---
## Summary

- **Total prompt construction sites:** 37
- **Avg score:** 4.8/10
- **Sites scoring 8+/10:** 4 ("good")
- **Sites scoring 4-7/10:** 23 ("warning")
- **Sites scoring 0-3/10:** 10 ("critical")

## Top 10 critical gaps to fix (ordered)

1. `worker/providers/ai-provider.ts:73` — Generic worker wrapper has **zero** guardrails: no retry, no scope limit, no validation, no fallback, no logging — every caller inherits all gaps. → Wrap in `chatCompletionWithRetry` and enforce `max_tokens` clamp.

2. `worker/providers/ai-provider.ts:51` — Legacy `generateText` helper has **zero** guardrails; should be deprecated. → Route all callers through the reply-engine infrastructure or add a worker-side `chatCompletionWithFallback`.

3. `worker/providers/semantic-memory.ts:21` — Fact extraction swallows all errors silently; no retry, no logging. → Use `chatCompletionWithRetry`, add structured logging, surface parse failures.

4. `backend/src/kloel/guest-chat.service.ts:218` — Public-facing guest chat has **no anti-invention guardrail** — model can hallucinate products, prices, policies to unauthenticated users. → Add explicit "do not invent" system prompt with negative examples.

5. `backend/src/kloel/kloel-lead-brain.service.ts:340` / `kloel-lead-processor.service.ts:180` — WhatsApp autopilot for paying customers has **no anti-invention guardrail**. → Add the same product-boundary guardrail as `autopilot-cycle-executor` ("NEVER invent product names, prices…").

6. `backend/src/ai-brain/agent-assist.helpers.ts` (all 4 operations) — No `max_tokens` on any agent-assist operation; unlimited token spend via wallet. → Add explicit `max_tokens` per operation type.

7. `backend/src/campaigns/campaigns.service.ts:481` — Campaign copy mutation has **no decision log** and **no output validation**. → Add `trackAiUsage` + output length/quality check.

8. `backend/src/kloel/kloel-composer.service.ts:154,279,330` — Composer capabilities (web search, image, site) have **no retry** on transient failures. → Route through `chatCompletionWithRetry` or add custom retry wrapper.

9. `backend/src/kloel/conversational-onboarding.service.ts:208` — Onboarding **throws on error** with no fallback reply to the user. → Add `catch` with a human-readable fallback message, matching the pattern used in other services.

10. `backend/src/kloel/kloel-reply-engine.helpers.ts:316` (and inheritors) — Best-scored core chat path still lacks **confidence gating for human handoff**. → Add confidence threshold (e.g., < 0.4 → escalate) after the ABI cognitive state is resolved.

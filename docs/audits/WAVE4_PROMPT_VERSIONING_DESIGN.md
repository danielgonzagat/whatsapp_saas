# Wave 4 — Prompt Versioning System Design

> Authored by PI atomic subagent `w4-prompt-versioning` (DeepSeek V4 Pro,
> ~14k events). Written by the subagent via atomic_author.
> Run date: 2026-05-26.


## Problem statement

The Wave 3 LLM-prompt-audit found **avg 4.8/10 quality score across 37 LLM
call sites**, with "no versioning" as the #1 gap on every site surveyed. When
an operator changes a prompt string today:

- There is **no way to tell which version** a past LLM decision was made under.
- There is **no diff** to review before the change ships.
- There is **no contract test** to assert the prompt still produces the expected
  output shape.
- There is **no ESLint/CI enforcement** to prevent raw template-literal prompts
  from spreading further.

CLAUDE.md **REGRA DE QUALIDADE DE IA §1** explicitly requires versioned prompts:

> "Prompt versionado ou builder central."

This design delivers that contract incrementally, without touching protected
files (`ai-models.ts`) and without removing any existing functionality.# Surveyed prompt sites (high-level)

The 37 LLM call sites were grouped into 6 construction-style categories.
Every category needs versioning, but each enters the registry through a
different adapter.

| # | Category | Example files | Construction style | Count | Risk |
|---|----------|---------------|-------------------|-------|------|
| 1 | Inline template-literal prompts | `agent-assist.helpers.ts`, `hidden-data.service.ts`, `media-factory.service.ts`, `campaigns.service.ts`, `autopilot-analytics-insights.service.ts`, `autopilot-cycle-executor.service.ts` | Backtick template literal assigned inline; no parameter extraction | ~10 | **HIGH** — unversioned, untested, spread across 6 modules |
| 2 | Single-constant prompts | `kloel.prompts.ts` (`CANONICAL_FALLBACK_SYSTEM_PROMPT`), `conversational-onboarding.service.ts` (`CONVERSATIONAL_ONBOARDING_PROMPT`) | Exported `const` string; consumed by 1–3 callers each | 2 | **MEDIUM** — versioned only by git blame |
| 3 | Builder-function prompts | `mind-verbalizer.service.ts` (`buildLlmPrompt`), `unified-agent-response.service.ts`, `smart-payment.service.ts`, `pdf-processor.service.ts` | `function build*(params): string` returning `string.join('\n')` | ~8 | **MEDIUM** — deterministic builders but no version tag |
| 4 | Worker-side AIProvider calls | `worker/processors/cia/conversation-policy.ts` (`buildWhatsAppConversationPrompt`), `worker/processors/autopilot/cognition-context.ts`, `execution-planner.ts`, `cognition-decision.ts` | `ai.generateResponse(systemPrompt, userPrompt, role)` with string args from builders or inline literals | ~6 | **HIGH** — outside backend DI, no logging, raw strings |
| 5 | Dynamic system prompt blocks | `agent-runtime.context.ts` (`renderSystemPromptBlock`), `agent-runtime.memory-manager.ts` | Programmatic `string[]` rendered into structured XML-ish blocks | ~2 | **LOW** — already structured, easy to tag with version |
| 6 | Large conversational personas | `conversational-onboarding-flow-templates.ts`, persona/workspace context blocks | Static flow templates + persona strings stored in DB | ~3 | **LOW** — DB-stored prompts are versioned at the persona level |

**Total: ~31 sites with concrete string prompts (excluding image/audio/embedding calls).**# Proposed system

### Layer 1: Versioned prompt registry

Prompts live in two new canonical directories:

```
backend/src/lib/prompts/
  registry.ts          ← Registry class (singleton)
  prompts.json         ← All versioned prompts as a JSON catalog
  prompt-types.ts      ← ResolvedPrompt, PromptEntry types
  __snapshots__/       ← Contract test snapshots (auto-generated)

worker/prompts/
  registry.ts          ← Mirror registry for worker runtime
  prompts.json         ← Same catalog (symlink or build-copy from backend)
```

**Versioning scheme: `major.minor` + content hash.**

Each prompt entry in `prompts.json` carries:

```json
{
  "id": "assistant.analyze_sentiment.system",
  "version": "1.2",
  "sha256": "abc123…",
  "template": "Classifique sentimento em positivo, neutro ou negativo.",
  "params": [],
  "model": "brain",
  "responseFormat": null,
  "temperature": 0.0,
  "maxTokens": 10,
  "changelog": [
    {
      "version": "1.0",
      "date": "2026-05-01",
      "author": "wave3-audit",
      "note": "Initial extraction from agent-assist.helpers.ts"
    },
    {
      "version": "1.1",
      "date": "2026-05-20",
      "author": "daniel",
      "note": "Added neutral detection threshold"
    }
  ]
}
```- **Version bumps are manual**: editing `prompts.json` increments `major.minor`
  and updates `sha256` (computed from the normalized template string). The
  changelog array is appended.
- **Content hash is the invariant**: CI compares `sha256(template)` against the
  stored hash. Mismatch without a version bump → CI fails.
- **Params** are declared explicitly. Templates use `{{param}}` placeholders
  (Mustache-style). A prompt with missing declared params gets `''` (never throws).
- **The registry is NOT a NestJS provider** — it's a plain TS module imported by
  both backend services and worker processes. No DI required.
- **Migration helper**: `legacy.resolve()` maps old prompt IDs to new registry
  IDs for gradual cutover.### Layer 2: Builder API

Callers ask for a prompt by ID and get back a versioned string + metadata:

```typescript
// backend/src/lib/prompts/registry.ts
import { PromptRegistry, type ResolvedPrompt } from './registry';

// Simple prompt (no params)
const prompt: ResolvedPrompt = PromptRegistry.instance.resolve(
  'assistant.analyze_sentiment.system',
  {}
);
// → { text: 'Classifique sentimento…', version: '1.2', sha256: 'abc123…', model: 'brain' }

// Parameterized prompt
const systemMsg = PromptRegistry.instance.resolve(
  'i18n.translate.system',
  { targetLang: 'Brazilian Portuguese' }
);
// → text: 'You are a translator. Translate the following text to Brazilian Portuguese…'
```

**Design invariants:**

1. `PromptRegistry` is a singleton loaded once at module init. Invalid catalog → startup fails.
2. `resolve()` NEVER throws at runtime for missing params (they get `''`).
3. The registry loads synchronously from JSON; no async I/O on the hot path.
4. Callers import `PromptRegistry` directly, replacing their inline strings.### Layer 3: Decision logging

Every LLM call that uses a registered prompt logs the decision to
`RAC_AuditLog` (existing table) with a standardized action code:

```typescript
await auditService.log({
  workspaceId,
  action: 'LLM_PROMPT_DECISION',
  resource: 'PromptDecision',
  details: {
    promptId: 'assistant.analyze_sentiment.system',
    promptVersion: '1.2',
    promptSha256: 'abc123…',
    model: 'deepseek-v4-flash',
    inputSha256: sha256(userMessage),
    temperature: 0.0,
    maxTokens: 10,
    costCents: '0.001',
  },
});
```

**Why reuse `RAC_AuditLog` instead of a new table:**

- `RAC_AuditLog` already has `action`, `resource`, `details` (JSON), `workspaceId`,
  `createdAt`, and indexes on `(workspaceId, createdAt)` and `(workspaceId, action)`.
- The `details` JSON column carries all prompt-variant fields; no schema change needed.
- A new table would add migration risk and query fragmentation without benefit.

**Logging wrapper**: `logPromptDecision()` wraps `chatCompletionWithRetry` and
automatically logs when a `ResolvedPrompt` is passed.

**Privacy**: `inputSha256` enables A/B comparison without storing raw
conversation text in the audit log.### Layer 4: Test contract

**Tier A — Snapshot diff (CI gate):**

When `prompts.json` changes, CI compares each changed prompt against its
previous version:

1. Render old and new templates with the same sample params.
2. Output a human-readable diff to the PR comment.
3. **Gate**: if a prompt changes WITHOUT a version bump, CI fails (sha256 mismatch).

**Tier B — Shape invariant tests:**

Prompts that produce structured output declare an `expectedShape`:

```json
{
  "id": "autopilot.analyze_conversation.system",
  "expectedShape": {
    "type": "json_object",
    "requiredKeys": ["intent", "sentiment", "buyingSignal", "stage"],
    "enumKeys": {
      "intent": ["question_price", "question_product", "complaint", "greeting",
                  "scheduling", "buying", "objection"],
      "sentiment": ["positive", "neutral", "negative"],
      "buyingSignal": ["boolean"]
    }
  }
}
```

A test helper `validatePromptShape(response, promptId)` asserts output shape
matches the declaration. These run inside existing service specs.# Migration plan

### Phase 1: New prompts use the registry

**Files to introduce:**

```
backend/src/lib/prompts/registry.ts        ← PromptRegistry singleton
backend/src/lib/prompts/prompts.json        ← Empty catalog scaffold
backend/src/lib/prompts/prompt-types.ts     ← ResolvedPrompt, PromptEntry types
backend/src/lib/prompts/registry.spec.ts    ← Unit tests for resolve, validation, sha256
backend/src/lib/prompts/__snapshots__/       ← Snapshot artifacts directory
worker/prompts/registry.ts                  ← Worker mirror
worker/prompts/prompts.json                 ← Symlink to backend catalog
```

**New CLAUDE.md rule to add (extending REGRA DE QUALIDADE DE IA §1):**

> 1a. Todo prompt novo DEVE ser registrado em `backend/src/lib/prompts/prompts.json`
>     com versão semântica + sha256. NÃO crie prompts inline em template literals.
> 1b. Use `PromptRegistry.instance.resolve(id, params)` para obter o texto versionado.
> 1c. Registre a decisão via `logPromptDecision()` no `RAC_AuditLog`.

Estimated: **M (3 days)** — infrastructure + tests + CI hook.### Phase 2: Migrate existing prompts (in order of risk)

Ranked by `risk × usage` (risk = financial/safety impact of unversioned prompt
drift; usage = call volume × number of workspaces affected):

| Rank | Prompt ID (proposed) | Current location | Risk | Usage |
|------|---------------------|------------------|------|-------|
| 1 | `autopilot.decision.classify` | `worker/processors/autopilot/cognition-decision.ts` | CRITICAL — drives autonomous money actions | High |
| 2 | `autopilot.context.reply` | `worker/processors/autopilot/cognition-context.ts` | CRITICAL — generates customer-facing WhatsApp messages | High |
| 3 | `smart_payment.payment_message` | `backend/src/kloel/smart-payment.service.ts` | CRITICAL — generates payment links + amounts | Medium |
| 4 | `smart_payment.negotiation` | `backend/src/kloel/smart-payment.service.ts` | CRITICAL — auto-approves discounts | Medium |
| 5 | `guest_chat.fallback` | `backend/src/kloel/guest-chat.service.ts` (via ABI flow) | HIGH — public web chat, no auth | High |
| 6 | `reply_engine.dashboard_prompt` | `backend/src/kloel/kloel-reply-engine.service.ts` | HIGH — every chat message | Very High |
| 7 | `unified_agent.reply_plan` | `backend/src/kloel/unified-agent-response.service.ts` | HIGH — multi-message orchestration | High |
| 8 | `onboarding.conversational` | `backend/src/kloel/conversational-onboarding.service.ts` | MEDIUM — workspace setup | Medium |
| 9 | `assistant.sentiment` | `backend/src/ai-brain/agent-assist.helpers.ts` | MEDIUM — drives autopilot decisions | Medium |
| 10 | `execution_planner.message` | `worker/processors/autopilot/execution-planner.ts` | MEDIUM — outbound tone | High |

**Remaining ~21 prompts** in two follow-up buckets:

- Bucket B: `i18n.*`, `autopilot.ask_insights`, `autopilot.analyze_conversation`,
  `media_factory.social_content`, `campaigns.mutate_copy`, `pdf_processor.analyze`,
  `hidden_data.extract`, `mind.verbalizer`, `thread_summary.title`.
- Bucket C: builder-function prompts, agent-runtime dynamic blocks, persona DB
  prompts.

Estimated per site: **S (1–2 hours)** simple, **M (0.5 day)** builder-function.
Total Phase 2: **L (2–3 weeks)** for all 31 sites.### Phase 3: Lockdown

**ESLint rule** (`no-inline-llm-prompt`):

Bans template-literal strings as `content` in objects with `role: 'system'` or
`role: 'user'` under `backend/src/kloel/`, `backend/src/ai-brain/`,
`worker/processors/`, and any file importing from `llm-provider`,
`openai-wrapper`, or `ai-provider`.

The rule allows indirect references (variables, function returns) — only raw
literals are caught.

**CI check** (`check:prompt-registry`):

Scans for `chat.completions.create` / `chatCompletionWithRetry` /
`generateResponse` / `generateChatResponse` call sites and ensures every one
references a registered prompt ID or is allowlisted.

Allowlist entries live in `backend/src/lib/prompts/allowlist.json` with glob
+ reason (e.g., embedding calls, user-supplied image descriptions). CI fails
if a new unregistered LLM call site appears without an allowlist entry.

Estimated: **M (3–4 days)**.# Open questions for the human owner

- **Q1: Shared vs. per-service catalogs.** Should `worker` and `backend` share
  one `prompts.json` (symlink) or have independent catalogs? Worker prompts are
  WhatsApp-generation specific; backend prompts are multi-purpose. Independent
  catalogs reduce coupling but duplicate registry code.
- **Q2: Version bump policy.** What triggers a major vs. minor bump?
  Proposal: MAJOR = semantic change (different instruction), MINOR =
  wording/formatting fix. Should CI enforce this mechanically?
- **Q3: Prompt A/B testing.** The design includes `inputSha256` in audit logs
  for offline comparison. Should the registry support a `canaryWeight` field
  for live A/B traffic splitting? Out of scope for Wave 4 but affects schema.
- **Q4: Persona prompts in DB.** ~14 persona records have `basePrompt` in the
  `Persona` table. Migrate into registry (losing per-workspace customization)
  or leave as-is with a `promptSource: 'db'` tag?
- **Q5: Worker registry loading.** Worker boots without NestJS DI. Should the
  worker `PromptRegistry` load synchronously from a JSON file (current design)
  or fetch from backend via HTTP on startup?

# Estimated effort

- **Phase 1 (registry infrastructure): M** — 3 days for one engineer.
  Includes: schema, PromptRegistry class, types, specs, CI sha256-gate, empty
  catalog, worker mirror.
- **Phase 2 (migrate existing prompts): L** — 2–3 weeks total. ~2 hours per
  simple prompt, ~0.5 day per builder-function prompt. Top 10 first (~5 days),
  remaining ~21 in follow-up batches (~7–8 days each).
- **Phase 3 (lockdown): M** — 3–4 days. ESLint rule, CI allowlist, integration
  testing.
- **Grand total: L (3–4 weeks)** for complete rollout across all 31 sites.

# MIND_SERVICE_CONSOLIDATION — PI-K29 Audit & Migration Plan

Date: 2026-05-29
Status: **Plan** (execution pending per ai-constitution: functional proof required before deletion)

## Summary

Three Kloel*/Mind* service pairs were audited for semantic duplication. **None are simple import-swap equivalents** — each pair shares a conceptual domain but has different API surfaces, DB tables, and core responsibilities. This document provides the audit findings and migration plan for each pair.

---

## Pair 1: KloelGlobalPriorService → MindGlobalPriorService

### Audit

| Dimension | KloelGlobalPriorService | MindGlobalPriorService |
|---|---|---|
| **File** | `backend/src/kloel/kloel-global-prior.service.ts` (88 lines) | `backend/src/kloel/mind/memory/mind-global-prior.service.ts` (269 lines) |
| **DB Table** | `kloelGlobalPrior` | `mindBanditArm` + `mindGlobalPrior` |
| **Purpose** | Per-tuple Beta-Binomial prior for (channel, decisionType, action) | Cross-workspace aggregated bandit-arm priors with persistence |
| **API** | `getPrior(channel, decisionType, action)` → `{mean, observations} | null`<br>`recordObservation(channel, decisionType, action, success)` → void | `getPrior(decisionType)` → `GlobalPrior`<br>`suggestedPrior({arm, decisionType})` → `{alpha, beta, fromGlobal}`<br>`lookupPrior(domain, predicate, context)` → `{alpha, beta} | null`<br>`getPriorFor(predicate)` → `{mean, samples} | null`<br>`listTopPriors(limit)` → `Array`<br>`listDecisionTypes()` → `string[]` |

### Consumers of KloelGlobalPriorService

1. **`DecisionOutcomeService.closeOutcome()`** — calls `globalPrior.recordObservation(channel, decisionType, chosenAction, wonVsBaseline)` to feed decision outcomes back into the global prior.

2. **`MindPolicyService.mixWithGlobalPrior()`** (private) — calls `globalPrior.getPrior(channel, decisionType, action)` to blend local bandit beliefs with cross-workspace prior means. This is the critical consumer.

3. **`mind-policy.helpers.recordOutcomeGlobalPrior()`** — helper that calls `globalPrior.recordObservation(channel, decisionType, action, success)` for each resolved policy row.

### Verdict: NOT a simple semantic duplicate

The two services operate on **different DB tables** with **incompatible API signatures**. KloelGlobalPriorService is a *low-level primitive* (per-tuple Beta prior) consumed BY MindPolicyService as a building block. MindGlobalPriorService is a *higher-level aggregate* that summarizes bandit arms across all workspaces.

### Migration Plan

**Phase 1a — Extend MindGlobalPriorService**:
- Add `getPrior(channel, decisionType, action)` delegate method that wraps `lookupPrior` with appropriate domain/predicate mapping (domain=`"channel"`, predicate=`` + decisionType + ":" + action``).
- Add `recordObservation(channel, decisionType, action, success)` delegate method that writes to `mindGlobalPrior` table with appropriate mean/variance updates.

**Phase 1b — Migrate consumers**:
- Change `DecisionOutcomeService` dependency from `KloelGlobalPriorService` to `MindGlobalPriorService`.
- Change `MindPolicyService.mixWithGlobalPrior()` to use `MindGlobalPriorService.getPrior(channel, decisionType, action)` with the new delegate.
- Update `recordOutcomeGlobalPrior` helper to call `MindGlobalPriorService.recordObservation`.

**Phase 1c — Remove KloelGlobalPriorService**:
- Once all callers are migrated and functional tests pass, delete `kloel-global-prior.service.ts` and its spec.
- Drop the `kloelGlobalPrior` table (requires ADR per ADR-0013 §3).

**Current state**: `@deprecated` JSDoc added to `KloelGlobalPriorService` (this PR) pointing to this document.

---

## Pair 2: KloelLeadProcessorService vs MindPolicyService

### Audit

| Dimension | KloelLeadProcessorService | MindPolicyService |
|---|---|---|
| **File** | `backend/src/kloel/kloel-lead-processor.service.ts` (345 lines) | `backend/src/kloel/mind/policy/mind-policy.service.ts` (471 lines) |
| **DB Tables** | `workspace`, `kloelLead`, `kloelConversation`, `contact`, `kloelMemory`, `product` | `mindPolicy`, `mindBanditArm`, `kloelGlobalPrior`, `kloelMemory` |
| **Dependencies** | PrismaService, UnifiedAgentService, SmartPaymentService, PlanLimitsService, OpsAlertService, AbiBuilderService, OpenAI | PrismaService, MindBeliefService, KloelGlobalPriorService, WisdomRelevanceFilter, WisdomPatternStore |
| **Purpose** | WhatsApp message processing pipeline: lead creation, conversation history, ABI building, LLM completion, payment generation, follow-up listing | Bandit decision-making engine: epsilon-greedy policy selection, outcome resolution, harness computation, autopilot confirmation |

### Overlap Analysis

The alleged overlap is in "decision tracking":

- **KloelLeadProcessorService** makes *operational decisions*: what to reply to a WhatsApp message, whether to generate a payment link, whether autopilot is enabled.
- **MindPolicyService** makes *strategic decisions*: which coupon to offer, which tone to use, whether to pause outreach — using Thompson sampling and outcome resolution.

They interact indirectly: KloelLeadProcessor calls `UnifiedAgentService.processIncomingMessage()`, which may consult MindPolicyService for autopilot decisions. But they are NOT code-level duplicates.

### Verdict: Different concerns, indirect interaction

These services exist at different layers of the cognitive stack:
- KloelLeadProcessorService = Channel handler (WhatsApp message → reply)
- MindPolicyService = Decision engine (choose action → resolve outcome)

**Overlap**: Both touch "decision" concepts, but at different abstraction levels. No code duplication found.

### Consolidation Path (Proposed)

Rather than merging (which would violate single-responsibility), the proposal is:

1. **Rename** `KloelLeadProcessorService` → `WhatsAppMessageProcessor` (following ADR-0013 naming conventions — "Mind*" prefix reserved for cognitive core, channel handlers use channel-specific names).
2. **Extract** the `detectBuyIntent` → `generatePaymentForLead` pipeline into a separate `CommerceIntentHandler` (single responsibility).
3. **Keep** `MindPolicyService` as-is — it already follows ADR-0013 canonical naming.

**Test surface**: `kloel-lead-processor.service.spec.ts` (419 lines, 15+ test cases) — must pass after rename.

**Risk**: LOW. This is a rename + extract, not a merge. No behavioral change.

---

## Pair 3: KloelThreadService vs MindCaseMemoryService

### Audit

| Dimension | KloelThreadService | MindCaseMemoryService |
|---|---|---|
| **File** | `backend/src/kloel/kloel-thread.service.ts` (249 lines) | `backend/src/kloel/mind/memory/mind-case-memory.service.ts` (111 lines) |
| **DB Tables** | `chatThread`, `chatMessage` | `mindCase` |
| **Dependencies** | PrismaService, KloelThreadSummaryService | PrismaService |
| **Purpose** | Chat thread lifecycle: create/resolve threads, persist user/assistant messages, conversation state, processing traces, summary delegation | Case memory for decision outcomes: record cases with tokenized text, find similar cases via Jaccard + feature overlap, provide LLM-friendly `findSimilarCases` |

### Overlap Analysis

The alleged overlap is in "conversation persistence":

- **KloelThreadService** manages the *live chat*: thread CRUD, message history, stream events, metadata normalization. It's the operational persistence layer for user conversations.
- **MindCaseMemoryService** manages *historical cases*: stores past decision contexts as searchable cases, provides similarity search. It's the memory bank for the cognitive core.

Both persist text, but for entirely different purposes:
- KloelThreadService: "What was said in this conversation?" (operational, linear)
- MindCaseMemoryService: "What happened in similar past situations?" (analytical, similarity-based)

### Verdict: Different concerns, complementary

These are complementary, not duplicate:
- KloelThreadService = short-term operational memory (chat thread)
- MindCaseMemoryService = long-term analytical memory (case bank)

**Overlap**: Both persist text blobs. No API or table overlap. No code duplication found.

### Consolidation Path (Proposed)

1. **Keep both services** — they serve genuinely different purposes.
2. **Consider bridging**: When a chat thread's decision outcome is resolved, automatically record it as a `MindCase` via `MindCaseMemoryService.recordCase()`. This is already partially done in `MindPolicyService.persistResolvedMemories()` which writes to `kloelMemory`.
3. **Rename** `KloelThreadService` → `ChatThreadService` (channel-agnostic name, following ADR-0012 channel unification).
4. **No change** to `MindCaseMemoryService` — already canonical.

**Risk**: VERY LOW. No merge needed. Rename only.

---

## Execution Order & Dependencies

| Step | Pair | Action | Depends On | Risk |
|------|------|--------|------------|------|
| 1 | #1 | Extend MindGlobalPriorService with per-tuple methods | Nothing | MEDIUM — API design |
| 2 | #1 | Migrate DecisionOutcomeService | Step 1 | LOW |
| 3 | #1 | Migrate MindPolicyService.mixWithGlobalPrior | Step 1 | MEDIUM — core path |
| 4 | #1 | Migrate recordOutcomeGlobalPrior helper | Step 1 | LOW |
| 5 | #1 | Delete KloelGlobalPriorService + spec | Steps 2-4 verified | LOW |
| 6 | #2 | Rename KloelLeadProcessorService → WhatsAppMessageProcessor | Nothing | LOW |
| 7 | #2 | Extract CommerceIntentHandler | Step 6 | LOW |
| 8 | #3 | Rename KloelThreadService → ChatThreadService | Nothing | LOW |
| 9 | #1 | Drop kloelGlobalPrior table | ADR required | MEDIUM |

---

## Gates

| Gate | Condition |
|------|-----------|
| G1 | `backend` tsc passes |
| G2 | `backend` jest passes (all affected specs) |
| G3 | Backend boot-smoke passes |
| G4 | No new `@ts-ignore` or bypass markers |
| G5 | Zero behavioral change (existing tests unchanged in assertion logic) |

---

## References

- ADR-0013 — Kloel Mind unification (naming conventions, deprecated alias policy)
- ADR-0012 — OmniCore channel unification
- `docs/architecture/SERVICE_CATALOG.md` — 580 services

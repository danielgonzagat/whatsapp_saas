# KloelThinker Reach — Chat / Workers / Autopilot Audit

**Date:** 2026-05-28
**Tag:** PI-k1
**Canonical module:** `backend/src/kloel/kloel-thinker.service.ts`

## Summary

`KloelThinkerService` orchestrates the deep-reasoning SSE/sync think loop (ABI build → LLM → tool planning → reply finalization). It is the cognitive spine of the chat path.

This audit traces every reach path into it.
---

## 1. Chat Stream → Thinker?

### `POST /kloel/think` — Dashboard SSE stream

**Chain:**
```
KloelController.think()                     # kloel.controller.ts:82
  → KloelService.think()                    # kloel.service.ts:109
    → KloelThinkerService.think()           # kloel-thinker.service.ts:82
```

**Verdict:** ✅ **YES** — full deep-reasoning loop (ABI, substrate, tool planning, composer).
---

### `POST /kloel/think/sync` — Dashboard sync

**Chain:**
```
KloelController.thinkSync()                 # kloel.controller.ts:172
  → KloelService.thinkSync()                # kloel.service.ts:164
    → KloelThinkerService.thinkSync()       # kloel-thinker.service.ts → thinkSyncImpl
```

**Verdict:** ✅ **YES** — sync deep-reasoning variant.
---

### `POST /kloel/onboarding/:workspaceId/chat/stream` — Onboarding chat SSE

**Chain:**
```
KloelController.chatOnboardingStream()      # kloel.controller.ts:301
  → ConversationalOnboardingService.chat()  # conversational-onboarding.service.ts:295
    → runOnboardingCompletion()             # raw OpenAI chatCompletionWithRetry()
```

**Verdict:** ❌ **NO** — bypasses the thinker entirely. Uses raw `chatCompletionWithRetry` with a static system prompt, no ABI, no substrate, no tool-planning pass. One-shot OpenAI.
---

## 2. Workers → Thinker?

**Verdict:** ❌ **NO**

- `worker/` has zero references to `KloelThinkerService`, `/kloel/think`, `thinkSync`, or `ChatMessage`.
- The worker WhatsApp engine (`worker/src/voice-processor.ts`, `worker/send-message-handler.ts`) uses its own LLM paths and the `send-message` API, never reaching the backend thinker.
---

## 3. Autopilot → Thinker?

**Verdict:** ❌ **NO**

- `backend/src/autopilot/` has zero references to `KloelThinkerService` or any thinker helper.
- Autopilot events flow through `LeadMindCoordinator` and `DecisionOutcomeService`, not the thinker.
---

## 4. WhatsApp → Thinker?

### `POST /kloel/whatsapp/webhook` — WhatsApp inbound

**Chain:**
```
WhatsAppBrainController.receiveWebhook()     # whatsapp-brain.controller.ts:80
  → WhatsAppMindCoordinator.processWebhook() # whatsapp-mind-coordinator.service.ts:56
    → handleIncomingMessage()                # :104
      → kloelService.thinkSync()             # :128
        → KloelThinkerService.thinkSync()
```

**Verdict:** ✅ **YES** — WhatsApp inbound messages do reach the thinker (sync mode, `mode: 'sales'`).
---

## Reach Matrix

| Path | Endpoint | Reaches Thinker | Mode |
|---|---|---|---|
| Dashboard chat SSE | `POST /kloel/think` | ✅ YES | Streaming deep loop |
| Dashboard chat sync | `POST /kloel/think/sync` | ✅ YES | Sync deep loop |
| Onboarding chat SSE | `POST /kloel/onboarding/:ws/chat/stream` | ❌ NO | Raw OpenAI one-shot |
| WhatsApp inbound | `POST /kloel/whatsapp/webhook` | ✅ YES | Sync, mode=sales |
| Worker WhatsApp engine | N/A (standalone) | ❌ NO | Own LLM path |
| Autopilot | N/A (backend service) | ❌ NO | LeadMindCoordinator |
---

## 5. Smallest Wiring Change (Onboarding → Thinker)

The onboarding chat stream is the only user-facing chat path that bypasses the thinker. The smallest change is to make `ConversationalOnboardingService.chat()` delegate a turn to `KloelService.thinkSync()` instead of the raw OpenAI call, then use the thinker's reply as the onboarding response.

```diff
// conversational-onboarding.service.ts

+ import { KloelService } from './kloel.service';

  constructor(
    prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly toolsService: ConversationalOnboardingToolsService,
+   private readonly kloelService: KloelService,
    @Optional() private readonly abiBuilder?: AbiBuilderService,
  ) { .. }

  async chat(workspaceId: string, userMessage: string, res?: Response): Promise<string | void> {
-   // .. build messages array, runOnboardingCompletion, tool loop ..
+   const result = await this.kloelService.thinkSync({
+     message: userMessage,
+     workspaceId,
+     mode: 'onboarding',
+   });
+   const responseText = result.response;
+
+   await this.toolsService.saveOnboardingMessage(workspaceId, 'user', userMessage);
+   await this.toolsService.saveOnboardingMessage(workspaceId, 'assistant', responseText);
+
+   if (res) {
+     this.writeSseResponse(res, responseText);
+     return;
+   }
+   return responseText;
  }
```

**Caveat:** The onboarding flow uses curated tool definitions (`ONBOARDING_SAFE_SETUP_TOOLS`) for structured data capture. Switching to the thinker would require the thinker's tool-planning branch to understand onboarding tools, or to inject onboarding-specific tools through the `allowedTools` filter on `ThinkRequest`. This is a one-line delegation change at the call site but needs tool alignment in the thinker. The diff above assumes `mode: 'onboarding'` is added to trigger onboarding-appropriate tool selection inside the thinker.

**Alternative (narrower):** Keep the `ConversationalOnboardingService` as-is for tool-based data capture but add a pre-processing call to `kloelService.thinkSync()` to append deep-reasoned context to the user message before the OpenAI call. This is even smaller (one call inserted before `runOnboardingCompletion`).
---

## 6. Verification

```bash
# Confirm no worker-side thinker references
grep -r 'KloelThinkerService\|kloel-thinker' worker/src worker/utils --include='*.ts' | wc -l
# → 0

# Confirm no autopilot thinker references
grep -r 'KloelThinkerService\|kloel-thinker' backend/src/autopilot --include='*.ts' | wc -l
# → 0

# Confirm the onboarding bypass
grep -r 'KloelThinkerService\|thinkerService' backend/src/kloel/conversational-onboarding.service.ts | wc -l
# → 0
```

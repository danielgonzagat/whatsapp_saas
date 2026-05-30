# Autopilot · Flows · Follow-up — the AI sales-agent territory

**One-line purpose:** Turn an incoming WhatsApp/social conversation into an automatic, on-brand sales reply (grounded in the workspace's real products) — or a scheduled follow-up nudge — with human-handover and compliance guards, and let users build/run visual automation Flows.

This territory is three cooperating sub-capabilities:

| Sub-capability | "What it does" in one line | Where it actually runs |
|---|---|---|
| **Autopilot** | AI reads pending messages and replies (or stays silent / hands to a human) | The **worker** (`autopilot-jobs` queue). Backend is control-plane only. |
| **Flows** | Visual node graph (trigger → message → wait → branch) the user builds and runs | Worker `flow-jobs` engine; backend stores/serves the graph |
| **Follow-up** | "Message this contact again in N hours" scheduled nudges | Backend cron enqueues → worker `followup-contact` sends |

> **WAHA note:** WAHA is the legacy WhatsApp transport and is being phased out in favor of Meta Cloud API (see `docs/adr/0001-whatsapp-source-of-truth.md`). References to WAHA in this territory are **deprecated, not gaps** — do not file work against them.

---

## What the user does

1. **Autopilot** — In `frontend/src/app/(main)/autopilot/` (and the settings card `frontend/src/components/kloel/settings/autopilot-section.tsx`) the user flips Autopilot **ON**, sets tone/aggressiveness config, and watches a live "actions" feed (replies sent, conversions, skips). From then on, when a customer messages on WhatsApp, the AI answers automatically using the workspace's real product catalog — never inventing prices or products. The user can hit **Stop / handover** at any time, run a **smoke test**, and mark a **conversion**.
2. **Flows** — In the funnels/flow builder UI (`frontend/src/app/(main)/funnels/page.tsx`, `frontend/src/components/flow/`) the user drags nodes into a graph, saves versions, and runs the flow for a contact. Execution logs and a retry button appear in `FlowExecutionsTab.tsx`.
3. **Follow-up** — The user (or an automation) schedules a future message for a contact ("nudge in 2 days"). At the due time the platform sends it automatically through Autopilot's send path.

---

## End-to-end flow (the real path)

### A. Autopilot reactive reply (customer messages → AI answers)

```
Customer sends WhatsApp message
  -> inbound webhook persisted
     (backend/src/marketing/channels/whatsapp/inbound-processor.service.ts)
  -> enqueues autopilotQueue 'scan-contact'         [queue: autopilot-jobs]
  -> WORKER consumes (worker/processors/autopilot-processor.ts, job 'scan-contact')
  -> runScanContact (worker/processors/autopilot/scan.ts)
       1. buildPendingMessageBatch  — aggregate unread customer messages
       2. checkScanPreFlight        — reply-lock (Redis) → idempotency, no double-send
       3. checkScanAutonomyBilling  — plan/quota gate
       4. runScanCognitivePipeline  — Mind cognitive state + product matching
       5. runScanDecisions / sendDirectAutopilotText — decide action + send
  -> flow/send queue delivers the WhatsApp message
  -> AutopilotEvent row written (status sent|skipped|failed)  [DB: RAC_AutopilotEvent]
  -> UI "actions" feed reflects it
```

### B. Autopilot control plane (UI toggles / reads stats)

```
autopilot-section.tsx / useAutopilotData.ts
  -> frontend/src/lib/api/autopilot.ts   (toggleAutopilot, getAutopilotStatus, ...)
  -> apiFetch (frontend/src/lib/api/core.ts)   [no Next proxy — direct to backend]
  -> AutopilotController  (backend/src/autopilot/autopilot.controller.ts, @Controller('autopilot'))
       POST /autopilot/toggle   -> AutopilotService.toggle/toggleAutopilot
       GET  /autopilot/status   -> AutopilotService.getStatus
       GET  /autopilot/stats    -> AutopilotAnalyticsService.getStats
       POST /autopilot/run      -> AutopilotOpsService.enqueueProcessing (adds 'scan-contact')
       POST /autopilot/test     -> AutopilotOpsService.runSmokeTest
       POST /autopilot/conversion -> AutopilotOpsConversionService
  -> AutopilotService is a thin facade delegating to the split services below
  -> Prisma (Workspace.providerSettings holds the autopilot config flags)
  -> UI states: loading / honest empty ("Nenhuma ação ainda") / error / success feed
```

> **Important:** `AutopilotCycleService.runAutopilotCycle` (the old in-backend reactive/proactive loop) is **intentionally disabled** — it returns `{ status: 'disabled', reason: 'legacy_backend_autopilot_disabled' }` unless `isLegacyExecutionEnabled()` is on. The **single execution source is the worker**. The backend cycle/executor code remains for `POST /autopilot/test` smoke paths and unit coverage.

### C. Flows (build → run)

```
Flow builder UI -> frontend/src/lib/api/flows.ts
  -> FlowsController (backend/src/flows/flows.controller.ts, @Controller('flows'))
       POST /flows/save/:ws/:flowId   -> FlowsService.save        [DB: RAC_Flow]
       POST /flows/version/:ws/:flowId-> FlowsService.saveVersion [DB: RAC_FlowVersion]
       POST /flows/run | :ws/:flowId/run -> FlowsService.createExecution
            -> flowQueue.add('run-flow', ...)   [queue: flow-jobs]
       GET  /flows/:ws / :ws/:flowId / executions / versions -> read paths
  -> WORKER consumes 'run-flow' (worker/processor.ts -> handleRunFlow -> flow-engine)
  -> executeNode (worker/flow-node-executor.ts) walks the graph node-by-node
  -> FlowExecution rows track status   [DB: RAC_FlowExecution]
  -> FlowsGateway (flows.gateway.ts) pushes live execution updates over WebSocket
```

### D. Follow-up (schedule → send)

```
FollowUpController (@Controller('followups')) POST/PATCH/DELETE
  -> FollowUpService.create/update/cancel   [DB: RAC_FollowUp]
FollowUpService.processDueFollowUps  @Cron(EVERY_MINUTE)   (backend cron)
  -> findDue() -> for each due row:
       resolve contact (workspace-scoped lookup)
       autopilotQueue.add('followup-contact', {...}, { jobId: dedup })
       markSent()
  -> WORKER runFollowupContact (worker/processors/autopilot/followup.ts) sends the message
```

---

## Canonical vocabulary

| Concept | Canonical name | Notes / lingering aliases |
|---|---|---|
| The AI auto-reply capability | **Autopilot** | — |
| One recorded autopilot decision/action | **AutopilotEvent** (`RAC_AutopilotEvent`) | statuses: `sent` / `skipped` / `failed` / `queued` |
| The worker reply pipeline entry | **scan-contact** job → `runScanContact` | the real reply brain |
| Backend control-plane facade | **AutopilotService** | delegates only; no business logic of its own |
| Proactive batch outreach | **money-machine** / `runSweepUnreadConversations` | the `sweep-unread-conversations` job |
| Decide-what-to-say logic | **decideAction / resolveActionResponse** | backend executor = smoke/legacy; worker `scan-decisions` = production |
| Visual automation graph | **Flow** (`RAC_Flow`) | versioned via **FlowVersion** |
| One run of a Flow | **FlowExecution** (`RAC_FlowExecution`) | |
| Scheduled re-engagement | **FollowUp** (`RAC_FollowUp`) | |
| AI policy/learning brain | **Mind** | canonical name (legacy "Brain" fully renamed; CIA = Mind's autonomous loop) |
| Pause-a-flow-until-reply | **wait-for-reply** | TWO impls — see Honest status |

The territory's commercial-reply guardrail vocabulary ("never invent product/price/deadline") is enforced in the prompt inside `generateResponse` and in worker `scan-decisions`.

---

## Key services & single responsibility

**Backend (`backend/src/autopilot/`)**
- `autopilot.service.ts` — **facade**: auth/billing/suspension/WhatsApp-connected gates + delegates to the services below; owns `toggle`, `getStatus`, `getConfig`, `triggerPostPurchaseFlow`, `sendDirectMessage`.
- `autopilot-cycle.service.ts` — legacy reactive/proactive cycle + compliance (opt-in, 24h window). **Disabled in prod** (`legacy_backend_autopilot_disabled`).
- `autopilot-cycle-executor.service.ts` — AI response generation (`generateResponse` via OpenAI), `executeAction`, product-grounded prompt, Mind policy hook. Used by smoke/test + legacy cycle.
- `autopilot-cycle-money.service.ts` — proactive "money machine" batch logic.
- `autopilot-ops.service.ts` — `enqueueProcessing` (the `scan-contact` producer the UI's `/run` hits), pipeline status, smoke test, retry.
- `autopilot-ops-conversion.service.ts` — `markConversion` + revenue attribution.
- `autopilot-analytics*.service.ts` — stats/impact/insights/report read models (3 split files for the 400-line cap).
- `segmentation.service.ts` + `segmentation.controller.ts` — contact segments/presets for targeting.

**Flows (`backend/src/flows/`)**
- `flows.service.ts` — CRUD for flows, versions, executions, variables; `createExecution` enqueues `run-flow`.
- `flows.wait-for-reply.ts` — `pauseForWaitNode` / `resumeFromWait` / `expireWaitTimeouts` (FlowExecution-table pause engine).
- `flows.gateway.ts` — WebSocket push of execution events.
- `flow-template.service.ts` / `flow-optimizer.service.ts` — starter templates + AI graph suggestions.

**Follow-up (`backend/src/followup/`)**
- `followup.service.ts` — CRUD + `@Cron(EVERY_MINUTE) processDueFollowUps` dispatcher + stats.

**Worker (production runtime, `worker/processors/autopilot/`)**
- `autopilot-processor.ts` — the `autopilot-jobs` BullMQ Worker; routes job names (`scan-contact`, `followup-contact`, `sweep-unread-conversations`, `cycle-*`, `cia-*`, `score-contact`, `catalog-contacts-30d`).
- `scan.ts` (`runScanContact`) — **the real reply pipeline**: aggregate → reply-lock → billing → cognitive → decide → send → post-send cleanup.
- `followup.ts` (`runFollowupContact`) — sends a scheduled follow-up across channels.
- `sweep.ts` (`runSweepUnreadConversations`) — proactive batch over unread conversations.
- `worker/flow-node-executor.ts` (`executeNode`) — the flow graph step executor; `worker/processor.ts` runs the `run-flow`/`resume-flow` worker.

---

## Data & events

**Prisma models owned (DB table = `RAC_` prefix):**
- `AutopilotEvent` → `RAC_AutopilotEvent` — every decision/action (audit + analytics source).
- `Flow` → `RAC_Flow`, `FlowVersion` → `RAC_FlowVersion`, `FlowExecution` → `RAC_FlowExecution`, `FlowTemplate` → `RAC_FlowTemplate`.
- `FollowUp` → `RAC_FollowUp`.
- Reads/writes (not owned): `Workspace.providerSettings` (autopilot config + WhatsApp connection), `Contact`, `Conversation`/`Message`, `Variable` (flow vars), and Mind tables (`RAC_MindPolicy`, `RAC_MindBanditArm`, `RAC_DecisionOutcome`, `RAC_DecisionOutcomeEvent`).

**Events (asyncapi):**
- Emits **`autopilot.toggled`** (declared in `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts`).
- Consumes/cooperates with the **`cognition.*`** spine (`cognition.decision_made`, `cognition.analysis_completed`, `cognition.belief_updated`, `cognition.valence_assigned`, `cognition.cia_backlog_action`) — Autopilot's reply brain is the Mind/CIA cognitive loop.

**Queues:** `autopilot-jobs` (scan/followup/sweep/cycle/cia), `flow-jobs` (run-flow/resume-flow/send-message). Producers are control-plane (backend); consumers are the worker.

---

## Workspace isolation

Every entry point is workspace-scoped:
- Controllers resolve `workspaceId` (path param or query) and services filter every Prisma query by it. Example: `FollowUpService.processDueFollowUps` keys its batched contact lookup as `${workspaceId}:${contactId}` so a contact can **never** be served from another tenant even on an id collision.
- `AutopilotService` runs `ensureNotSuspended(workspaceId)` and `ensureBillingAllowsAutopilot` before any action; the worker repeats billing/quota gates (`checkScanAutonomyBilling`, `ensureDailyMessageQuota`, `ensureMessageRate`).
- Autopilot config + WhatsApp-connected state live on that workspace's `Workspace.providerSettings` — no cross-tenant config bleed.
- Queue job ids include `workspaceId` (`buildQueueJobId('scan-contact', workspaceId, ...)`) for tenant-safe dedup.

---

## Honest status (brutally honest)

**Works end-to-end in production (worker runtime is the real engine):**
- Reactive reply: customer message → `scan-contact` → product-grounded AI reply → WhatsApp send. The pipeline has real idempotency (Redis reply-lock), billing/quota gates, smoke-test mode, and post-send cleanup. Covered by `worker/test/autopilot-reply.spec.ts`, `autopilot-runtime-evidence.spec.ts`, `scan-contact.spec.ts`, `autopilot-processor.spec.ts`.
- Follow-up: `@Cron` dispatcher → `followup-contact` worker send, with tenant-safe contact resolution and dedup job ids. Covered by `followup.service.spec.ts`, `worker/test/followup-contact.spec.ts`, `followup-scheduler.spec.ts`.
- Autopilot control plane: toggle/status/config/stats/run/test/conversion routes are real and wired to Prisma + the queue producer.
- Product-grounding guardrail is real: `generateResponse` refuses to offer products when the workspace has none and instructs the model never to invent names/prices.

**Caveats / facade / unproven:**
- **`AutopilotCycleService.runAutopilotCycle` is disabled by design.** The backend executor (`generateResponse`/`executeAction`) only runs for smoke tests and legacy unit tests — it is NOT the production reply path. A reader must not assume backend autopilot "does the replying." This is correct architecture but a common misread.
- **Two wait-for-reply implementations exist.** The production flow engine pauses/resumes via worker `resume-flow` + `engine.onUserResponse` (`worker/processor.ts`). The backend `flows.wait-for-reply.ts` (`resumeFromWait` / `expireWaitTimeouts`, FlowExecution-table based) has **no runtime caller** outside the `FlowsService` wrappers and its own tests — no controller route and no cron invoke it. It is implemented-but-unwired (see gaps).
- **Mind learning-loop closure is partial.** Outcomes are recorded in some paths (`recordDecisionOutcome` in worker `cia/cognitive-state`, `mind-bandit.service.recordOutcome`), but `silent-24h-resolver-processor.ts` documents that `decisionOutcomeEvent` is "currently unwired — no service emits 'inbound.received' yet (DecisionOutcomeService.recordEvent has no callers)." So the bandit/outcome loop is wired for some decisions, open for the inbound-reply outcome signal.
- PULSE: live module-health artifacts must be regenerated (`pulse_scan` then `pulse_health_by_module`) before quoting a per-module %; this doc states the wiring facts, not a fresh PULSE number.

---

## Start here (newcomer reading order)

1. **`worker/processors/autopilot/scan.ts`** (`runScanContact`) — this is the real "what does Autopilot actually do" file. Read it first; everything in the backend is control-plane around it.
2. **`backend/src/autopilot/autopilot.controller.ts`** + **`autopilot.service.ts`** — the HTTP surface and the facade that gates and enqueues. Shows how the UI talks to the engine.
3. **`worker/processor.ts`** (scheduler block + `run-flow` switch) — how cron schedules `cycle-all` and how Flows run; confirms the worker, not the backend, is the execution source.

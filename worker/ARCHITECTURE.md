# worker-jobs — the BullMQ background-job runtime that turns "later" work into real effects

The KLOEL **worker** is a standalone Node process (deployed as its own Railway
service, built from `worker/Dockerfile`) whose only job is to **consume BullMQ
queues backed by Redis** and execute the slow, retryable, or scheduled work that
must not block an HTTP request: sending WhatsApp messages, running flows,
dispatching campaigns, scraping leads, transcribing/generating audio, embedding
knowledge-base text, calling outbound webhooks, and running the autopilot/CIA
sales cycle.

It is the **consumer** half of a producer/consumer split. The **backend**
(NestJS) is the producer: it pushes jobs into Redis via `backend/src/queue/queue.ts`.
The worker pulls them out and runs them. The two never call each other directly
for this work — **Redis is the only wire between them**. They agree on queue
names and job-name strings; that contract is the entire integration surface.

> WAHA is intentionally **deprecated** here. WhatsApp send/receive runs through
> the Meta Cloud API provider path (`worker/providers/whatsapp-engine.ts` ->
> `whatsapp-api-provider.ts`). Chromium/Xvfb survive in the Dockerfile only for
> the generic lead **scraper**, not for WhatsApp.

---

## What the user does

The user never "uses the worker" directly — there is **no worker UI**. The user
does something in the app that is too slow or too scheduled to do inline, and
the worker finishes it in the background. Concretely:

- Clicks **"Run flow"** / a flow fires on an inbound WhatsApp message -> the flow
  executes step-by-step in the worker.
- Sends a **campaign** / **mass send** to many contacts -> the worker fans out one
  throttled message job per contact.
- Starts a **lead scraper** job (Google Maps / Instagram) -> the worker drives a
  headless browser, persists leads, and creates CRM deals.
- Uploads **knowledge-base** text -> the worker chunks it, embeds it with OpenAI,
  and stores vectors for retrieval.
- Receives a **voice note** on WhatsApp -> the worker transcribes it (Whisper);
  or asks for TTS -> the worker generates an audio file.
- Turns on **Autopilot** -> the worker scans conversations and replies with AI,
  schedules follow-ups, and resolves "went-silent" outcomes on a cron.
- Registers an outbound **webhook** -> the worker POSTs signed payloads to the
  user's URL.

The user perceives results as: a message arriving on WhatsApp, a campaign moving
to `COMPLETED`, leads showing up in the CRM, an audio file URL appearing, a
knowledge source flipping to `INDEXED`. Each of those is a worker job completing.

---

## End-to-end flow

There is no single flow — there is one flow **per queue**. The shape is always
the same: **UI -> frontend api client -> Next proxy (some) -> Nest controller ->
Nest service produces a BullMQ job -> Redis -> worker consumer -> Prisma ->
DB -> effect**. Two representative paths, with real file:symbol names:

### A. Send a campaign (fan-out)

1. UI campaign page -> frontend api client `frontend/src/lib/api/campaigns.ts`.
2. Nest `CampaignsController` -> `CampaignsService.send()`
   (`backend/src/campaigns/campaigns.service.ts:176`) calls
   `campaignQueue.add('process-campaign', { campaignId, workspaceId })` via the
   **producer** `backend/src/queue/queue.ts` (`campaignQueue` proxy -> Redis queue
   `campaign-jobs`).
3. Worker consumer `worker/campaign-processor.ts` (`campaignWorker`, concurrency 5)
   loads the `RAC_Campaign` row, resolves the audience from `RAC_Contact`, then
   **re-enqueues** one job per contact onto `flow-jobs` via `flowQueue.addBulk(...)`
   — either `run-flow` (template is a flow id) or `send-message` (raw text), each
   with cumulative jitter delay. Marks `RAC_Campaign.status` RUNNING -> COMPLETED.
4. The `flow-jobs` worker (`worker/processor.ts:flowWorker`, concurrency 1) picks
   each up: `send-message` -> `handleSendMessage` (`worker/send-message-handler.ts`)
   -> `WhatsAppEngine.sendText/sendMedia/sendTemplate` -> Meta Cloud API; persists
   `RAC_Message` + `RAC_Conversation` and publishes a realtime alert on Redis pub/sub.
5. UI reflects status by polling the campaign (`status: COMPLETED`, `stats.sent`).

### B. Inbound WhatsApp message -> Autopilot reply

1. Meta webhook -> backend `marketing/channels/whatsapp/inbound-processor.service.ts`
   persists the inbound `RAC_Message`, and (if autopilot on) calls
   `autopilotQueue.add('scan-contact', { workspaceId, contactId, ... })` -> Redis
   queue `autopilot-jobs`. (Audio -> `voiceQueue.add('transcribe-audio', ...)` first.)
2. Worker consumer `worker/processors/autopilot-processor.ts` (`autopilotWorker`,
   concurrency 4) dispatches by `job.name` -> `runScanContact`
   (`worker/processors/autopilot/scan.ts`) which scores the contact, decides via the
   CIA cognition stack (`worker/processors/cia/*`), and sends the AI reply through the
   canonical outbound path (`worker/providers/outbound-dispatcher.ts`).
3. Effect: a `RAC_Message` (OUTBOUND) on WhatsApp + a `RAC_AutopilotEvent` audit row.

### Producer -> consumer map (the integration contract)

| Redis queue | Producer (backend) -> job name(s) | Worker consumer file |
|---|---|---|
| `flow-jobs` | `flows.controller.ts`, `webhooks.service.ts`, `autopilot.service.ts`, `whatsapp-message-dispatcher.service.ts`, `inbound-processor.service.ts` -> `run-flow`, `resume-flow`, `send-message`, `incoming-message`, `scheduled-followup` | `worker/processor.ts` (`flowWorker`) |
| `autopilot-jobs` | `autopilot-ops.service.ts`, `followup.service.ts`, `inbound-processor.service.ts`, `cia-*.service.ts` -> `scan-contact`, `followup-contact`, `cycle-all`, `cycle-workspace`, `cia-cycle-*`, `cia-action`, `score-contact`, `catalog-contacts-30d`, `sweep-unread-conversations` | `worker/processors/autopilot-processor.ts` |
| `campaign-jobs` | `campaigns.service.ts`, `autopilot-cycle-money.service.ts` -> `process-campaign` | `worker/campaign-processor.ts` |
| `mass-send` | `mass-send.service.ts` | `worker/processors/mass-send-processor.ts` |
| `scraper-jobs` | `scrapers.service.ts` -> `run-scraper` | `worker/scraper-processor.ts` |
| `media-jobs` | `media.service.ts` -> `generate-video` | `worker/media-processor.ts` |
| `voice-jobs` | `voice.service.ts` -> `generate-audio`; `inbound-processor.service.ts` -> `transcribe-audio` | `worker/voice-processor.ts` |
| `memory-jobs` | `knowledge-base.service.ts` -> `ingest-source`, `extract-facts`, `analyze-contact` | `worker/processors/memory-processor.ts` |
| `crm-jobs` | `checkout-social-lead.service.ts` -> `checkout-social-lead-enrich`, `check-inactivity` | `worker/processors/crm-processor.ts` |
| `webhook-jobs` | `webhook-dispatcher.service.ts` | `worker/processors/webhook-processor.ts` |
| `silent-24h-resolver` | (self-scheduled cron, `*/5 * * * *`) -> `resolve-expired` | `worker/processors/silent-24h-resolver-processor.ts` |
| `mind-self-evolution` | (self-scheduled cron, every 6h) -> `sweep-all` | `worker/processors/mind-self-evolution-cron.ts` |
| `ads-sync-meta`, `google-ads-sync-jobs` | `backend/src/integrations/ads-sync.processor.ts` | **consumed inside the backend, not the worker** |

> Note: the backend producer (`backend/src/queue/queue.ts`) does **not** export
> `silent24hResolverQueue` / `massSendQueue` / `mindSelfEvolutionQueue`. Those
> queues are produced by the worker itself (self-scheduled repeatables) and by
> dedicated backend services (`mass-send.service.ts`). `ads-sync` queues are
> produced and consumed entirely within the backend — the worker never touches
> them despite appearing in `QUEUES_CATALOG.md`.

---

## Canonical vocabulary

- **Queue** — a named BullMQ stream on Redis (e.g. `flow-jobs`). The canonical
  registry is the `QUEUE_NAMES` list defined in `worker/queue.ts` and mirrored by
  `backend/src/queue/queue.ts`. Authoritative catalog:
  `docs/architecture/QUEUES_CATALOG.md` (note: it lists scan false-positives
  `dlq`, `waiting`, `exponential`, `flow-engine` — those are dynamic-name artifacts,
  not real standalone queues).
- **Producer** — code that calls `<queue>.add(jobName, data, opts)`. Lives in the
  backend (`backend/src/queue/queue.ts` proxies) or, for crons, in the worker itself.
- **Consumer / Processor** — a `new Worker(queueName, handler, opts)`. One per queue,
  registered by importing it from `worker/processor.ts`.
- **Job name** — the string passed as the first arg to `.add()`; the consumer
  `switch`es on `job.name`. The producer↔consumer agreement on these strings is the
  contract (see `worker/contracts/autopilot-jobs.ts`, CI-mirrored byte-for-byte).
- **DLQ (Dead-Letter Queue)** — `<queue>-dlq`; a job lands here after exhausting its
  `attempts`. Created lazily alongside each queue in `worker/queue.ts:attachDlq`.
- **Idempotency / dedup key** — `job:dedup:<queue>:<dedupKey|jobId>` in Redis, set
  for 24h on completion (`worker/processor-base.ts`).
- **WhatsAppEngine** — the canonical send abstraction (`worker/providers/whatsapp-engine.ts`),
  Meta-only. The job-side `handleSendMessage` and the flow-engine-side `sendMessage`
  are **distinct by design** — see `docs/architecture/SEND_MESSAGE_CANONICAL.md`,
  do NOT consolidate.
- **CIA** — the autopilot cognition stack (`worker/processors/cia/*`), Commercial
  Intelligence Agent. **Mind** — the platform-wide self-evolution loop driven only
  by the `mind-self-evolution` cron.
- Lingering aliases: `transcriptionWorker` is an alias of `voiceWorker`
  (`worker/voice-processor.ts`); the `crm-jobs` worker is internally named
  `ghostCloserWorker`.

---

## Key services & single responsibility

| File | Owns (one line) |
|---|---|
| `worker/bootstrap.ts` | Process entry: init Sentry/Datadog, resolve `REDIS_URL`, guard ioredis's localhost default, then dynamic-import `processor.ts`. |
| `worker/queue.ts` | The **Lazy Queue System** — zero Redis sockets on import; lazily creates each queue + DLQ + QueueEvents via Proxy; `shutdownQueueSystem()`. |
| `worker/processor.ts` | Worker process **lifecycle**: imports every consumer, registers the `flow-jobs` worker + its job switch, schedules repeatables, graceful SIGTERM/SIGINT shutdown. |
| `worker/processor-base.ts` | Shared job lifecycle helpers: correlationId, workspaceId extraction, `checkIdempotent`/`markCompleted`, structured start/end/error logging. |
| `worker/send-message-handler.ts` | The `send-message` job: plan-limit gate, contact/conversation upsert, send via WhatsAppEngine, persist success/failure. |
| `worker/campaign-processor.ts` | `campaign-jobs`: resolve audience, fan out to `flow-jobs` with jitter, track `RAC_Campaign` status. |
| `worker/processors/mass-send-processor.ts` | `mass-send`: fan a recipient list out to `flow-jobs` `send-message`. |
| `worker/scraper-processor.ts` | `scraper-jobs`: Puppeteer Google-Maps/Instagram scrape -> `RAC_ScrapedLead` + `RAC_Contact` + `RAC_Deal`. |
| `worker/media-processor.ts` | `media-jobs`: media render lifecycle on `RAC_MediaJob` (currently a stubbed render — see Honest status). |
| `worker/voice-processor.ts` | `voice-jobs`: OpenAI Whisper transcription + TTS generation, persists `RAC_VoiceJob`. |
| `worker/processors/memory-processor.ts` | `memory-jobs`: chunk + embed knowledge text into `RAC_Vector`, settle prepaid-wallet usage, fact extraction, lead scoring. |
| `worker/processors/crm-processor.ts` | `crm-jobs`: inactivity "ghost closer" nudges + checkout social-lead enrichment. |
| `worker/processors/webhook-processor.ts` | `webhook-jobs`: SSRF-validated, HMAC-signed outbound webhook POST. |
| `worker/processors/autopilot-processor.ts` | `autopilot-jobs`: dispatch scan/followup/score/cycle/cia jobs to the CIA stack. |
| `worker/processors/silent-24h-resolver-processor.ts` | Cron: close expired `RAC_DecisionOutcome` rows as replied/silent_24h, update `RAC_KloelGlobalPrior`. |
| `worker/processors/mind-self-evolution-cron.ts` | Cron: every 6h POST `/internal/mind-self-evolution/trigger` on the backend. |
| `worker/dlq-monitor.ts` | Periodic self-healing: retries transient DLQ jobs (max 3) and alerts ops on backlog. |
| `worker/metrics.ts` + `metrics-server.ts` | Prometheus metrics + `/health` + token-guarded `/metrics` HTTP server (Railway healthcheck target). |
| `worker/flow-engine-global.ts` | The flow execution engine singleton used by `run-flow`/`resume-flow`/`incoming-message`. |

---

## Data & events

**Prisma models the worker reads/writes** (table prefix `RAC_`, confirmed live via
`pg_tables`): `RAC_Campaign`, `RAC_Contact`, `RAC_Conversation`, `RAC_Message`,
`RAC_Deal`, `RAC_Pipeline`, `RAC_Stage`, `RAC_ScrapedLead`, `RAC_ScrapingJob`,
`RAC_MediaJob`, `RAC_VoiceJob`, `RAC_VoiceProfile`, `RAC_KnowledgeSource`,
`RAC_Vector` (`RAC_Vector` via raw `INSERT ... ::vector`), `RAC_Workspace`,
`RAC_Flow`, `RAC_FlowExecution`, `RAC_AutopilotEvent`, `RAC_DecisionOutcome`,
`RAC_DecisionOutcomeEvent`, `RAC_KloelGlobalPrior`, `prepaid_wallet_transactions`
(via `prepaid-wallet-settlement`). The worker uses a **direct Prisma client**
(`worker/db.ts`) against the same Postgres as the backend.

**Events** — the worker does NOT speak the NestJS AsyncAPI event spine (the 122
`commerce.*` / `cognition.*` / `agent.*` events listed by `protocol_hub_asyncapi`
are emitted/consumed inside the **backend**). The worker's "events" are:
- **BullMQ queue events** (`QueueEvents.on('failed')`) -> DLQ routing.
- **Redis pub/sub**: job failure alerts on `alerts:<workspaceId>` (`processor.ts`)
  and realtime message pushes from `persistSuccess` (`redisPub`).
- **Agent events** via `worker/providers/agent-events.ts` (`publishAgentEvent`),
  the worker's outward signal for autopilot/CIA cycle activity.

---

## Workspace isolation

Multi-tenancy is enforced **per job**, because every queue is global (one Redis
stream shared by all tenants):

1. **Every job payload carries `workspaceId`** (or a nested `workspace.id`).
   `worker/processor-base.ts:extractWorkspaceId` pulls it for logging and dedup
   scoping; if absent it logs `'unknown'`.
2. **Every Prisma query filters by `workspaceId`** — `findFirst/updateMany/findMany`
   all include `{ workspaceId }` (e.g. `campaign-processor.ts` audience query,
   `send-message-handler.ts` contact upsert via `workspaceId_phone`,
   `voice-processor.ts` job + profile lookups). Workspace-less writes are guarded
   (e.g. `voice-processor.ts` throws `VOICE_NO_WORKSPACE`).
3. **Cross-workspace crons are explicit**: the `silent-24h-resolver` scans ALL
   workspaces' open outcomes (marked `@CrossWorkspaceMaintenance`) but every row it
   touches carries its own `workspaceId` used for the downstream scoped writes.
4. **Dedup keys are namespaced by queue + job id**, not globally, so two tenants'
   jobs cannot collide.

---

## Honest status

What actually works end-to-end (evidence: code paths above + 72 spec files under
`worker/test/`, run with `vitest`):

- **Queue infrastructure: real and solid.** Lazy init opens zero sockets on import
  (regression test `worker/test/queue-lazy-init.spec.ts`); per-queue DLQ + failed-job
  routing + self-healing monitor are wired and tested
  (`dlq-routing.spec.ts`, `dlq-monitor.spec.ts`, `queue-dlq-notifier.spec.ts`).
- **Idempotency: real** — Redis dedup key checked in every consumer
  (`job-id-dedup.spec.ts`), plus BullMQ `jobId` dedup on cron repeatables.
- **send-message / flow / campaign / mass-send: real** end-to-end through the Meta
  WhatsApp engine + Prisma persistence (covered by `whatsapp-engine.spec.ts`,
  `campaign-processor.spec.ts`, `mass-send.processor.spec.ts`).
- **voice transcription, memory embedding, webhook dispatch, scraper (Maps): real**
  external calls (OpenAI / axios / Puppeteer) with SSRF guards and wallet settlement.
- **Autopilot/CIA reactive scan-and-reply: real** and the most heavily tested area
  (~30 `cia-*` / `autopilot-*` / `cognitive-state-*` specs), but its **proactive
  outreach is gated OFF by default** (`ALLOW_PROACTIVE_OUTREACH !== 'true'`), so the
  `cycle-all` cron and the legacy scanner do not run in production unless explicitly
  enabled. The reactive path (triggered by inbound messages) is the live one.

Facade / unproven / gaps (brutally honest):

- **`media-processor.ts` is a stub render.** It `setTimeout(2000)` then writes a
  fabricated `outputUrl` (`<CDN>/media/<jobId>.mp4`) without generating any actual
  media. The job completes "successfully" but no file exists. This is a placebo
  handler. The backend producer job name is `generate-video` but no real renderer
  is invoked.
- **Instagram scraper is mock/temporary** (header comment in `scraper-processor.ts`;
  `GROUP` scraping throws `SCRAPER_NOT_IMPLEMENTED`).
- **`silent-24h-resolver` reply attribution is dead.** Its comment is explicit: no
  service emits `inbound.received` into `RAC_DecisionOutcomeEvent`, so the reply
  lookup always returns null and **every expired outcome closes as `silent_24h`**.
  Fail-safe (no false "replied" wins) but real reply attribution is lost until the
  event is wired on the producer side.
- **PULSE**: `pulse_health_by_module` returned no per-module worker artifact in this
  pass ("run pulse_scan first"), so no module score is cited here; treat the
  test-suite + code-path evidence above as the ground truth.

---

## Start here

For a newcomer, read these three files in order:

1. **`worker/processor.ts`** — the spine. It imports every consumer and shows the
   whole job catalog at a glance (the `flow-jobs` switch + the `import './...'` list).
2. **`worker/queue.ts`** — how queues/DLQs/connections are created lazily and how
   failed jobs get dead-lettered. Understand this and you understand the plumbing.
3. **`worker/processor-base.ts`** — the 130-line contract every consumer obeys
   (correlationId, workspace scoping, idempotency, structured logging). Once you see
   this, every individual `*-processor.ts` reads the same way.

Then pick the one queue you care about from the producer↔consumer table above and
read its single consumer file end-to-end.

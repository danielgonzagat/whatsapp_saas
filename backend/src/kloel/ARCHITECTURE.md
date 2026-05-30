# Mind / CIA / Agent-Runtime — KLOEL's cognitive brain

**One-line purpose:** This territory is KLOEL's *cognitive engine* — the part of the
product that reads each customer conversation, decides what the AI seller should do
next, acts (replies / sends payment links / updates the CRM), and **learns** from the
outcome so the next decision is better. It powers the WhatsApp commercial autopilot and
the in-dashboard "Kloel" copilot chat.

> Territory root: `backend/src/kloel/`. The cognitive substrate lives under
> `backend/src/kloel/mind/`; the always-on autonomy runtime under `mind/cia/`; the
> general-purpose agent infra under `agent-runtime/`; and a set of small, single-purpose
> business services under `services-v2/`.

---

## 1. What the user does (plain language)

A KLOEL workspace owner connects their WhatsApp and turns on the autopilot ("CIA" — the
**C**ommercial **I**ntelligence **A**gent). From then on:

- A customer messages the workspace's WhatsApp. KLOEL reads the message, figures out the
  customer's intent, and **replies on its own** — answering questions, sending product
  info, generating a PIX/checkout link, recording the sale.
- The owner can also chat with **Kloel** directly inside the dashboard ("the copilot") to
  ask things like "how were sales today?" or "create a payment link for R$200" — Kloel
  runs real tools against the workspace's real data.
- The owner sees an "autonomy surface": pending human-approval tasks, market signals, and
  a cognitive-health readout (`/cia/surface/:workspaceId`).
- Every reply quietly feeds a learning loop: KLOEL predicts whether a reply will work,
  observes what actually happened, and adjusts its future behavior (which tone, which
  format, whether to offer a coupon, etc.) per workspace.

The user never sees the cognitive machinery directly — they see a WhatsApp seller that
acts and gradually gets smarter, plus a copilot chat.

---

## 2. End-to-end flow (the real path, with file paths)

There are **two entry surfaces** into the cognitive engine. Both close the same learning loop.

### A) Dashboard copilot chat ("the think endpoint")

```
Dashboard chat UI
  → frontend api client  frontend/src/lib/api/kloel.ts (apiFetch → /kloel/think, /kloel/think/sync)
  → Nest controller      backend/src/kloel/kloel.controller.ts
                           POST /kloel/think        (KloelController.think — SSE stream)
                           POST /kloel/think/sync   (KloelController.thinkSync — JSON)
  → service              backend/src/kloel/kloel.service.ts  (KloelService — thin orchestrator)
                           → KloelThinkerService     kloel-thinker.service.ts        (plans the turn)
                           → KloelReplyEngineService kloel-reply-engine.service.ts   (builds the reply + LLM call)
                           → KloelToolDispatcherService kloel-tool-dispatcher.service.ts (executes tool calls)
  → Prisma models        KloelConversation / KloelMessage (legacy log) + MindMemory
  → DB tables            RAC_KloelConversation, RAC_KloelMessage, RAC_KloelMemory
  → response             SSE token stream (text + tool events) via kloel-stream-writer.ts
  → UI states            streaming reply, tool-result cards, degraded ("IA indisponível") on LLM failure
```

### B) WhatsApp autopilot (the always-on commercial agent)

```
Inbound WhatsApp message (WAHA / Meta Cloud webhook — see /kloel/whatsapp/webhook)
  → CiaRuntimeService     backend/src/kloel/mind/cia/cia-runtime.service.ts   (bootstrap, backlog runs, presence)
  → UnifiedAgentService   backend/src/kloel/unified-agent.service.ts          (UnifiedAgentController POST /kloel/agent/:workspaceId/process)
                            loads context → builds layered prompt → LLM → tool dispatch → composes reply
  → Prisma models         Conversation, Message, KloelSale, Contact
  → DB tables             RAC_Conversation, RAC_Message, RAC_KloelSale, RAC_Contact
  → response              reply pushed back to the channel transport (channel-transport.providers.ts)
  → UI states             owner sees autonomy surface + per-conversation proof (/cia/conversation-proof/...)
```

### The learning loop (runs inside BOTH paths above — this is "Y", the CIA cognitive loop)

The producers are extracted into one file —
`backend/src/kloel/kloel-reply-engine.decision-outcome.helpers.ts` — and called from the
reply path (`kloel-reply-engine.service.ts`, `guest-chat.service.ts`,
`conversational-onboarding.service.ts`). For one reply:

```
1. DECIDE   recordChatReplyDecision(...)  → DecisionOutcomeService.recordDecision()
              writes a RAC_DecisionOutcome row (decisionType="chat_reply",
              chosenAction="engage", baselineAction="silence")
              file: backend/src/kloel/decision-outcome.service.ts:39

2. PREDICT  predictChatReply(...)         → MindPredictorService.predictReply()
              writes a RAC_MindPrediction row with predicate "P(reply|template,hour,channel)"
              file: backend/src/kloel/mind/inference/mind-predictor.service.ts:30

3. ACT      (the actual reply is sent)

4. RESOLVE  resolveChatReplySurprise(...) → MindSurpriseService.resolveReply()
              resolves the open prediction AND moves the RAC_MindBelief alpha/beta
              (predicted vs observed → surprise); logs when surprise > 0.3
              file: backend/src/kloel/mind/inference/mind-surprise.service.ts

5. REWARD   closeChatReplyOutcome(...)    → DecisionOutcomeService.closeOutcome()
              closes the RAC_DecisionOutcome, then fire-and-forget feeds the win/loss
              into MindBanditService.recordOutcome() → upserts a RAC_MindBanditArm
              (alpha/beta/wins increment)
              file: decision-outcome.service.ts:82 → mind/policy/mind-bandit.service.ts:187

6. PRIOR    recordChatReplyGlobalPrior(...) → MindGlobalPriorService.recordObservation()
              grows the cross-workspace RAC_MindGlobalPrior row so a brand-new
              workspace inherits population-level priors
```

On the **next** decision the engine reads back what it learned: `MindService.resolve*`
(e.g. `resolveTone`, `resolveCoupon`, `resolveHumanTransfer` in `mind.service.ts`) ask
`MindBanditService.selectArm()` for the best arm by UCB score, and `build-mind-signals.helper.ts`
injects those signals into the LLM prompt. The loop is closed.

A separate **background tick** also drives the loop without a live message:
`MindBackgroundScheduler` (`mind/mind-bg.scheduler.ts`, BullMQ queue `mind-bg-tick`)
periodically calls `MindService.tick(workspaceId)` (`mind.service.ts:46`) which perceives
new events, processes them through `MindEventProcessorService`, sweeps expired
predictions, and records workspace health.

---

## 3. Canonical vocabulary

The canonical source is `docs/architecture/CANONICAL_VOCABULARY.md` §6 and
`docs/architecture/MIND_SERVICES_CANONICAL.md` (ADR-0013 "Kloel Mind unification").

| Canonical name | What it means here | Forbidden aliases / lingering legacy |
|---|---|---|
| **Mind** (`Mind*` prefix) | The cognitive engine namespace — ALL cognitive services & the 16 `RAC_Mind*` tables | `Brain*`, `AI*`, `ML*`, `Intelligence*`. `Brain*` survives **only** as type/DTO/one controller under `mind/coordination/**` plus legacy `whatsapp-brain.controller.ts` (route `kloel/whatsapp`) — dissolving under ADR-0013 |
| **CIA** | Commercial Intelligence Agent — the always-on WhatsApp autonomy runtime (`mind/cia/`) | "autopilot" is the user-facing word; CIA is the runtime |
| **Copilot** | The in-dashboard Kloel chat (the `/kloel/think` surface), not a separate service | — |
| **Belief** | A Beta(α,β) probability the engine holds about an outcome | `Probability`, `Confidence`, `Score` (in cognitive context); `RAC_MindBelief` |
| **Prediction** | A forward bet written before acting, resolved after | `Forecast`, `Projection`; `RAC_MindPrediction` |
| **Percept** | A raw observation entering the engine | `Observation`, `Signal`, `Event(raw)` |
| **Valence** | Emotional charge assigned to events | `Sentiment`, `Tone`, `Polarity` |
| **BanditArm** | One candidate action the contextual bandit chooses between | `Variant`, `Option`, `Strategy`; `RAC_MindBanditArm` |
| **DecisionOutcome** | The append-only record of "we chose X over baseline Y; here's what happened" | — ; `RAC_DecisionOutcome` |
| **GlobalPrior** | Cross-workspace population prior so new tenants don't start blind | — ; `RAC_MindGlobalPrior` |
| **Capability** | A unit of agent ability (a tool/skill) | `Skill`, `Action`, `Tool` (`Tool` allowed only for LLM tool-call payloads) |
| **Outbox** | Durable event spine table | `EventLog` (forbidden); not to be conflated with `AuditLog` |

**Lingering duplicate worth noting:** `KloelMessage` (`RAC_KloelMessage`) is the legacy
cognitive log; `MindMessage` (`RAC_MindMessage`) is the canonical replacement and
`KloelMessage` is being backfilled into it (3 direct callers remain per the vocabulary doc).

---

## 4. Key services & single responsibility

### Cognitive substrate (`mind/`)
- **`MindService`** (`mind.service.ts`) — the cognitive façade: `tick()` runs one
  background cognitive cycle; `resolve*()` answer per-decision "what should I do?" by
  consulting the bandit + priors.
- **`MindBanditService`** (`mind/policy/mind-bandit.service.ts`) — contextual Thompson/UCB
  bandit. Owns arm registration, `choose`/`selectArm`, and `recordOutcome` (the reward step).
- **`MindPredictorService`** (`mind/inference/mind-predictor.service.ts`) — writes & resolves
  `RAC_MindPrediction` rows (predictive coding).
- **`MindSurpriseService`** (`mind/inference/mind-surprise.service.ts`) — computes prediction
  error (surprise) and moves the underlying belief.
- **`MindBeliefService`** (`mind/inference/mind-belief.service.ts`) — Beta(α,β) beliefs.
- **`MindGlobalPriorService`** (`mind/memory/mind-global-prior.service.ts`) — cross-workspace priors.
- **`MindPolicyService`** (`mind/policy/mind-policy.service.ts`) — turns a decision request into
  a concrete arm choice + outcome resolution; owns the decision catalog & baselines.
- **`MindPerceptionService`** / **`AttentionService`** / **`ValenceAggregatorService`** —
  build the perception/attention/valence signals injected into prompts.
- **`MindEventProcessorService`** (`mind/runtime/`) — processes spine events into predictions/beliefs.
- **`MindBackgroundScheduler`** + **`MindBackgroundProcessor`** (`mind/mind-bg.*`) — BullMQ-driven
  `tick()` loop per registered workspace.
- **`MindCaseMemoryService`** / **`MindWorkspaceStateService`** — episodic case memory & per-workspace
  tick state/watermarks/leases.

### Autonomy runtime (`mind/cia/`)
- **`CiaRuntimeService`** (`cia-runtime.service.ts`) — orchestrates bootstrap, backlog runs,
  WhatsApp presence heartbeat, pause/resume.
- **`CiaService`** (`cia.service.ts`) — read/act surface for the dashboard: human tasks,
  approvals, proof snapshots, cognitive highlights.
- **`CiaBootstrapService` / `CiaBacklogRunService` / `CiaRuntimeStateService`** — bootstrap,
  backlog execution, and execution-record persistence respectively.

### Decision/learning glue (territory root)
- **`DecisionOutcomeService`** (`decision-outcome.service.ts`) — append-only decision ledger;
  `recordDecision` opens, `closeOutcome` closes-and-rewards the bandit.

### Copilot / commercial agent (territory root)
- **`KloelService`** + `KloelThinkerService` / `KloelReplyEngineService` /
  `KloelToolDispatcherService` — the copilot turn pipeline (plan → reply → tools).
- **`UnifiedAgentService`** (`unified-agent.service.ts`) — the WhatsApp commercial agent
  orchestrator (context → layered prompt → LLM → tool dispatch → compose).

### General agent infra (`agent-runtime/`)
- Session store, context compressor, evidence store, delegation, memory curator/manager,
  policy, scheduler, skill registry — reusable building blocks (`agent-runtime/index.ts`).

### Single-purpose business services (`services-v2/`)
- One file per concern: `subscription`, `refund`, `churn`, `nps`, `review`, `shipping`,
  `pixel`, `lead`, `messaging`, `theme`, `brand`, `document`, `ai-config`,
  `product-ai-config`, `search`, `session`, `agent-job`, `abandonment`. Each is a thin,
  typed Prisma service the agent's tools call into.

---

## 5. Data & events

### Prisma models owned (table prefix `RAC_`)
Cognitive: `MindBelief`, `MindPrediction`, `MindBanditArm`, `MindPolicy`, `MindCase`,
`MindConceptDetection`, `MindGlobalPrior`, `MindWorkspaceState`, `MindGraphNode`,
`MindGraphEdge`, `MindOutboxEvent`, `MindGuardAudit`, `MindDailyReport`, `MindSelfModel`,
`MindMessage`, `MindMemory` (16 `Mind*` models). Decision ledger: `DecisionOutcome`,
`DecisionOutcomeEvent`, `DecisionShadow`. Legacy cognitive log (dissolving): `KloelConversation`,
`KloelMessage`, `KloelMemory`, `KloelLead`, `KloelGlobalPrior`.

### Events (from the cognition asyncapi domain — `protocol_hub_asyncapi { domain: "cognition" }`)
Emitted/consumed on the event spine: `cognition.analysis_started`,
`cognition.analysis_completed`, `cognition.belief_updated`, `cognition.decision_made`,
`cognition.valence_assigned`, `cognition.cia_backlog_action`. Durable delivery is via
`MindOutboxEvent` + the Spine (`mind/coordination/mind-event-spine.service.ts`).

---

## 6. Workspace isolation (multi-tenant scoping)

Every cognitive write and read is keyed by `workspaceId`:
- `MindBanditService` arms are keyed `workspaceId_decisionType_arm` (a Prisma compound
  unique) — see the upsert in `mind-bandit.service.ts:199`.
- `DecisionOutcomeService` always filters by `workspaceId`; `MindService.tick` acquires a
  per-workspace lease (`MindWorkspaceStateService.tryAcquireTickLease`) so two ticks can't
  race on the same tenant.
- The CIA backlog/presence loops register workspaces individually
  (`MindBackgroundScheduler.registerWorkspace`).
- **Cross-workspace by design (documented):** `DecisionOutcomeService.findAllClosedSince`
  and `MindGlobalPrior` aggregate across tenants for population-level lift/priors — these
  are explicitly annotated `@CrossWorkspaceAnalytics` (decision-outcome.service.ts:145) and
  never expose one tenant's rows to another; they only produce anonymous aggregates.
- A dedicated regression guard exists: `mind/mind-cross-workspace-isolation.spec.ts`.

---

## 7. Honest status (what really works vs facade/unproven/gap)

**Brutally honest, evidence-based (measured 2026-05-30):**

- **Code wiring: COMPLETE and proven in isolation.** The full 6-step learning loop is
  wired across every reply surface (reply-engine, guest-chat, conversational-onboarding)
  and the background tick. The closure `closeOutcome → MindBanditService.recordOutcome`
  is implemented (decision-outcome.service.ts:106-123), self-healing (upsert, not
  failing on missing arm), and fire-and-forget (a learning failure never breaks a reply).
  A real end-to-end liveness proof drives one reply through the **real** services against
  a recording Prisma double and asserts all four loop tables get rows:
  `backend/src/kloel/cognitive-loop-liveness.proof.spec.ts` (+ `.part2` failure path,
  `cognitive-loop-realdb.proof.integration.spec.ts`).

- **Live data: the loop is essentially DORMANT in this environment.** Direct DB counts
  (read-only Postgres, 2026-05-30): `RAC_MindBanditArm = 0`, `RAC_DecisionOutcome = 0`
  (0 closed), `RAC_MindPrediction = 0`, `RAC_MindCase = 0`, `RAC_DecisionShadow = 0`; only
  `RAC_MindBelief = 15` (seed-ish) and `RAC_MindWorkspaceState = 4`. The liveness-proof
  spec header documents this exact fact. So the engine **compiles and the loop closes
  under test, but it has not yet accumulated real-traffic learning data here** — it needs
  a connected WhatsApp + live conversations (or production traffic) to populate the arms.
  This is the single most important caveat: the bandit currently has nothing to exploit,
  so `selectArm` returns "exploring (no prior data)" everywhere.

- **Copilot (`/kloel/think`) and UnifiedAgent: functional** — real LLM call, real tool
  dispatch against real Prisma data, honest degraded state on LLM failure. CLAUDE.md
  classifies Unified Agent ~75%, Autopilot ~90%.

- **KNOWN DEFECT (do NOT fix in this pass — recorded as a gap):** dev-only synthetic PIX.
  `kloel-chat-tools.workspace.helpers.ts:308` builds a hand-rolled PIX EMV payload with a
  random checksum and a fake `pay_dev_*` id and returns `success: true` with a QR code.
  It is gated behind `process.env.NODE_ENV !== 'production'`, so it does NOT run in prod —
  but in any non-prod env the copilot will claim a real PIX was generated when it was
  fabricated. This is a facade/honesty risk (violates the "no fake payment link" rule for
  non-prod surfaces). See gap below.

- **WAHA:** intentionally excluded / deprecated — Meta Cloud API is the strategic
  transport per ADR-0001. Not a gap.

- **PULSE / test honesty:** `PULSE_CERTIFICATE.json` flags placeholder tests in a few
  territory files (`capability-registry/*.spec.ts`, `hypproof/*.spec.ts`,
  `kloel-tool-dispatcher.service.chat-tools.spec.ts`, `unified-agent-actions-sales.helpers.spec.ts`).
  These are real spec-quality gaps, not loop gaps.

---

## 8. Start here (for a newcomer)

Read these 3 files, in order, and you understand the whole territory:

1. **`backend/src/kloel/kloel-reply-engine.decision-outcome.helpers.ts`** — the entire
   learning loop as 6 small, heavily-commented producer functions. This is the heart of "Y".
2. **`backend/src/kloel/cognitive-loop-liveness.proof.spec.ts`** — the loop proven
   end-to-end; its header tells you exactly which tables must fill and why they're empty.
3. **`backend/src/kloel/mind.service.ts`** — the `tick()` cycle and the `resolve*()`
   decision façade that reads the learned arms back out.

Then skim `docs/architecture/MIND_SERVICES_CANONICAL.md` and
`docs/architecture/CANONICAL_VOCABULARY.md` §6 for the naming law (Mind vs Brain).

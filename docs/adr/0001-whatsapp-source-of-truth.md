# ADR 0001: WhatsApp Source of Truth

**Status:** Accepted **Date:** 2026-04-08 **Deciders:** Daniel (owner), KLOEL
engineering **Supersedes:** none

---

## Context

The KLOEL platform delivers WhatsApp messaging. Historical documentation
(README, CLAUDE.md) described a browser-based architecture using Puppeteer
against WhatsApp Web via a `worker/browser-runtime/` subsystem. An investigation
on 2026-04-08 confirms that architecture **does not exist** in the current
codebase:

- `worker/browser-runtime/` — **does not exist** (`ls` returns "No such file or
  directory").
- `puppeteer.launch` / `chromium.launch` — appears only in scrapers
  (`worker/scrapers/google-maps.ts`, `worker/scrapers/instagram.ts`) and
  unrelated scripts. **Zero occurrences in the WhatsApp code path.**

The actual WhatsApp integration uses two HTTP-based providers:

| Provider                            | Implementation                                                                                            | Primary use                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Meta Cloud API                      | `backend/src/whatsapp/providers/whatsapp-api.provider.ts` and `worker/providers/whatsapp-api-provider.ts` | Default                                                                                                      |
| WAHA (WhatsApp HTTP API, community) | `backend/src/whatsapp/providers/waha.provider.ts`                                                         | Optional fallback, explicitly restored in commit `523f0f04 feat: restore WAHA provider alongside Meta Cloud` |

There is a clean provider routing layer in the backend. There is **no**
equivalent routing layer in the worker — the worker hardcodes `"meta-cloud"` in
multiple places regardless of workspace configuration. This creates a
split-brain condition: a workspace marked as WAHA in the backend will receive
autopilot and campaign messages via Meta Cloud from the worker.

### Evidence

**Backend dispatch (clean, supports both):**

- `backend/src/whatsapp/providers/provider-registry.ts:37-52` —
  `WhatsAppProviderRegistry` reads `process.env.WHATSAPP_PROVIDER_DEFAULT`.
  Values: `meta-cloud` (default) or `whatsapp-api`/`waha`.
- `provider-registry.ts:54-56` — `isWahaMode()` requires BOTH the env var AND
  the `WahaProvider` being injected. If either is missing, dispatch silently
  falls through to Meta Cloud.
- `provider-registry.ts:119-450` — every session/send/status operation branches
  on `isWahaMode()`.

**Worker dispatch (broken, hardcoded to Meta Cloud):**

- `worker/processor.ts:55` — `const DEFAULT_WHATSAPP_PROVIDER = "meta-cloud";`
  (string constant, no env read).
- `worker/providers/registry.ts:5-7` —
  `function getDefaultWhatsAppProvider(): "meta-cloud" { return "meta-cloud"; }`
  (return type literal `"meta-cloud"` cannot express any other value).
- `worker/providers/unified-whatsapp-provider.ts:7, 13` —
  `whatsappProvider: "meta-cloud"` hardcoded in `normalizeWorkspace`.
- `worker/providers/auto-provider.ts:12, 39` —
  `const providerName = "meta-cloud";`
- `worker/providers/whatsapp-api-provider.ts:32, 39` —
  `whatsappProvider: "meta-cloud"` in the default workspace stub.
- `worker/providers/whatsapp-engine.ts:12` — same hardcode in normalizer.

The worker has no dependency on `WhatsAppProviderRegistry` or `WahaProvider`.
The worker cannot currently send a message via WAHA even if the workspace is
configured for it.

**Misleading log line:**

- `backend/src/whatsapp/whatsapp-watchdog.service.ts:514` —
  `this.logger.log('🧭 Meta Cloud mode active: legacy WAHA/browser paths disabled');`
- This log fires unconditionally on module init, regardless of the actual
  `WHATSAPP_PROVIDER_DEFAULT` value. It predates commit `523f0f04` which
  restored WAHA. **The log is factually wrong** and should be removed or made
  conditional in P4-3.

### Message persistence (shared between layers)

The `Message` model at `backend/prisma/schema.prisma:488-519` is the canonical
message store. Key facts:

- Field: `externalId String?` — "ID from Provider (Meta/WPP)" (line 490).
- **Unique constraint:** `@@unique([workspaceId, externalId])` at line 517. This
  enforces Invariant **I2 (Message Dedup)** at the database level.
- Comment at line 515-516: _"Índice único parcial para idempotência (P0).
  Garante que a mesma mensagem do provedor não seja duplicada."_

Writes to `Message.create` happen in **both layers**:

| Layer   | File                                            | Purpose                                         |
| ------- | ----------------------------------------------- | ----------------------------------------------- |
| Backend | `backend/src/inbox/inbox.service.ts:151`        | Outbound sends from the inbox UI                |
| Backend | `backend/src/kloel/kloel.service.ts:2330`       | Internal service-generated messages             |
| Worker  | `worker/processor.ts:584, 672`                  | Job-processed outbound sends (flows, campaigns) |
| Worker  | `worker/flow-engine-global.ts:1159, 1237`       | Flow engine sends                               |
| Worker  | `worker/processors/autopilot-processor.ts:5818` | Autopilot AI-generated sends                    |

Both layers use the same `prisma.message.create` call. The unique constraint
enforces dedup across layers at the DB level.

### Confirmed dead/removed code

- `worker/browser-runtime/` subsystem — **does not exist**.
- Any reference to "browser runtime", "Puppeteer-based WhatsApp", "WhatsApp Web
  session" in README.md and CLAUDE.md is **fiction** — remove in P4-3.

---

## Decision

### D1 — Primary provider: Meta Cloud API

Meta Cloud is the default for all new workspaces. All workspaces operate on Meta
Cloud unless explicitly opted into WAHA.

Rationale: Meta Cloud is the official API, has SLAs, supports media/templates
natively, and is the provider most referenced in the backend code. The
production deployment environment already has Meta Cloud credentials wired up.

### D2 — Fallback provider: WAHA (process-wide)

WAHA remains as an explicit opt-in fallback, enabled via the **process-wide**
`WHATSAPP_PROVIDER_DEFAULT` environment variable. This preserves the intent of
commit `523f0f04`.

- **Granularity:** process-wide. One deployment runs one provider. To run both
  providers simultaneously, deploy two backends (plus two workers) with
  different env vars.
- **Values:** `WHATSAPP_PROVIDER_DEFAULT=meta-cloud` (default) or
  `WHATSAPP_PROVIDER_DEFAULT=whatsapp-api` / `waha` to select WAHA.
- **Enable condition:** WAHA is active only when BOTH the env var is set AND
  `WahaProvider` is injected in the backend DI container. If either is missing,
  dispatch silently falls through to Meta Cloud (existing behavior in
  `provider-registry.ts:54-56`).
- **Per-workspace opt-in is rejected** for now. A future ADR may revisit this if
  there is concrete business need to serve Meta Cloud and WAHA workspaces from
  the same deployment. The simpler process-wide model matches the existing code
  and allows easy rollback by flipping the env var.

### D3 — Event source of truth: `Message` table with `@@unique([workspaceId, externalId])`

The `Message` Prisma model is the authoritative log of every WhatsApp message,
inbound and outbound. All other projections (UI inbox, analytics, CRM pipeline)
are derived from this table. The `(workspaceId, externalId)` unique constraint
enforces Invariant I2 at the DB level and must not be removed.

- **Inbound messages:** written by the layer that receives the provider webhook
  (currently the backend).
- **Outbound messages:** written by the layer that initiates the send — the
  inbox handler (backend) for UI-driven sends, the worker for job-driven sends
  (flows, campaigns, autopilot).

Both layers must use the same `@@unique` constraint; duplicate inserts are
expected to raise `P2002` and be handled gracefully (treated as "already
persisted").

### D4 — Persistence canonical location: backend Prisma schema

The `Message`, `Conversation`, and `Contact` models live in
`backend/prisma/schema.prisma`. After PR P2-1 lands, this is the **only** Prisma
schema in the repository; the worker generates its Prisma client from the same
file. The worker never owns schema definitions.

### D5 — Retry, ordering, dedup ownership

- **Retry:** BullMQ job retry is the single retry mechanism. The worker's
  `whatsapp-engine.ts` uses a distributed lock (fixed in PR P0-1) to serialize
  sends per workspace. There is no separate retry layer in the backend outbound
  path.
- **Ordering:** Per-workspace serialization via `withWorkspaceActionLock` in the
  worker enforces ordering within a single workspace. Cross-workspace ordering
  is not enforced (each workspace is an independent serialization domain).
- **Dedup:** The `Message.@@unique([workspaceId, externalId])` constraint is the
  last line of defense. The application layer should also check before insert
  using the same key.

### D6 — Browser runtime is abandoned

All documentation references to "browser runtime", "Puppeteer WhatsApp
sessions", and `worker/browser-runtime/` are removed in PR P4-3. The misleading
`whatsapp-watchdog.service.ts:514` log line is also removed (or made conditional
on actual provider) in P4-3.

### D7 — Worker provider dispatch must be unified with backend

The worker's hardcoded `"meta-cloud"` in 6 locations is a bug. Since WAHA is
**process-wide** (D2), the fix is simple: the worker reads the same
`WHATSAPP_PROVIDER_DEFAULT` env var that the backend reads, and dispatches
accordingly.

**Scope:** folded into **PR P2-4** (lazy queue initialization + shutdown handler
in worker). The P2-4 PR is extended with a single additional task:

- Replace all 6 hardcoded `"meta-cloud"` call sites with calls to a new shared
  helper `getWhatsAppProviderFromEnv()` that reads `WHATSAPP_PROVIDER_DEFAULT`
  using the same precedence as
  `backend/src/whatsapp/providers/provider-registry.ts:46-51`. The helper
  returns the same type: `"meta-cloud" | "whatsapp-api"`.
- Files to update (6):
  - `worker/processor.ts:55` — `DEFAULT_WHATSAPP_PROVIDER` constant.
  - `worker/providers/registry.ts:5-7` — `getDefaultWhatsAppProvider` function
    (widen return type).
  - `worker/providers/unified-whatsapp-provider.ts:7, 13` —
    `normalizeWorkspace`.
  - `worker/providers/auto-provider.ts:12, 39` — `providerName` locals.
  - `worker/providers/whatsapp-api-provider.ts:32, 39` — workspace stub.
  - `worker/providers/whatsapp-engine.ts:12` — normalizer.
- Add a worker test `worker/test/provider-routing.spec.ts` that sets
  `WHATSAPP_PROVIDER_DEFAULT=whatsapp-api`, re-imports the helper, and asserts
  the resolved provider name.
- If a `WahaProvider` adapter does not yet exist in the worker (it currently
  doesn't), the helper still returns the correct string; actual WAHA send
  support in the worker is a follow-up PR since the worker has no `WahaProvider`
  implementation today. Document this gap explicitly.

**Known gap:** there is currently no `WahaProvider` implementation in
`worker/providers/`. The only provider the worker can physically talk to is Meta
Cloud (`whatsapp-api-provider.ts`). This means D7 unblocks _routing_ but does
not by itself make the worker capable of sending via WAHA — that requires a new
worker-side `waha-provider.ts` mirroring the backend's `WahaProvider` HTTP
client. This follow-up is tracked but NOT part of P2-4's scope.

---

## Consequences

### Positive

- Single WhatsApp architecture story in documentation — no more fiction about
  browser runtimes.
- Worker and backend both respect the same provider routing decision (after D7
  is implemented).
- Invariant I2 (message dedup) is enforced at the DB level and verified across
  both layers.
- Future refactors can safely assume `Message` is the canonical log.

### Negative

- **Short-term effort:** PR P2-4 scope expands to include worker provider
  unification.
- **Operator discipline:** the `WHATSAPP_PROVIDER_DEFAULT` env var must be set
  consistently across backend and worker deployments (Railway has this).
- **Test surface:** PR P0-1 (lock bypass fix) and subsequent PRs must add tests
  for both Meta Cloud and WAHA paths.

### Neutral

- PR P0-1 (lock bypass) is **not** affected by D7 — the lock semantics fix is
  provider-agnostic and can proceed immediately once this ADR is accepted.

---

## Alternatives Considered

### Alt 1: Delete WAHA entirely

Rejected because commit `523f0f04` explicitly restored WAHA support, indicating
active intent to support it as a fallback.

### Alt 2: Move all WhatsApp logic to the worker (worker owns everything)

Rejected because the backend already has a clean provider registry and the inbox
UI requires synchronous responses (status, send-now) that are natural to handle
in the backend.

### Alt 3: Move all WhatsApp logic to the backend (backend owns everything)

Rejected because job-driven sends (flows, campaigns, autopilot) benefit from
BullMQ's retry/ordering/backpressure, which lives in the worker. Moving them to
the backend would require reimplementing BullMQ semantics in a request handler.

### Alt 4: Dual-owner with no shared rules

The current state. Rejected because it creates the exact split-brain bug this
ADR is resolving.

---

## References

- Commit `523f0f04 feat: restore WAHA provider alongside Meta Cloud`
- Commit
  `e6ca0647 fix: prioritize QR code flow over Meta OAuth in WhatsApp connection`
- Commit `8ba0f6f2 fix: resolve WhatsApp 401 cascade and QR code never loading`
- `backend/src/whatsapp/providers/provider-registry.ts` (clean dispatch)
- `worker/providers/registry.ts`,
  `worker/providers/unified-whatsapp-provider.ts` (hardcoded Meta Cloud)
- `backend/prisma/schema.prisma:488-519` (`Message` model with dedup constraint)
- `docs/superpowers/plans/` — Big Tech hardening plan (this ADR is PR P0-0)

# Frontend WhatsApp API Audit (Wave 28, ADR-0012 follow-up)

**Date:** 2026-05-27
**Scope:** `frontend/src/lib/api/whatsapp.ts`, `frontend/src/lib/api/whatsapp-api.ts`, `frontend/src/lib/api/whatsapp-helpers.ts`
**ADR reference:** `docs/adr/0012-kloel-omnicore-channel-unification.md` + `docs/architecture/CONNECT_CHANNEL_CANONICAL.md`

## Current state

Three frontend modules implement the WhatsApp API surface:

| File | Style | Real callers | Role |
|------|-------|--------------|------|
| `whatsapp.ts` (495 → 486 lines) | Bag of named exports | 4 files (effects + controller + actions + 1 page) | Connection lifecycle, catalog, brain, opt-in/out, screencast helpers, viewer placeholders |
| `whatsapp-api.ts` (172 lines) | `whatsappApi` object | 4 files (ChatController, AuthProvider, WhatsAppConsole, useWhatsAppSession) | Session start/claim/disconnect/logout, chat list+messages, backlog, contacts |
| `whatsapp-helpers.ts` (198 lines) | Shared utilities | only `whatsapp.ts` | URL normalization, status mapping, contact list extraction, mutating-request wrapper |

Both `whatsapp.ts` and `whatsapp-api.ts` ultimately hit the same backend prefix `/whatsapp-api/*` (Meta Cloud API canonical entry). They duplicate session lifecycle endpoints (start / disconnect / logout / status / viewer / takeover / resume / pause) under two different idiomatic styles.

Per ADR-0012, the canonical backend surface is `marketing/channels/whatsapp` (waves W1–W4). ADR-0012 explicitly defers the frontend reorganization ("a reorganização da UI segue ondas próprias"). `CONNECT_CHANNEL_CANONICAL.md` Step 2 authorizes a single immediate cleanup: delete the misnamed `connectWhatsapp` function (which does a `GET /session/status` despite its name).

## Dead-code list (zero in-repo consumers)

Search method: `grep -rEn "\\b<symbol>\\b" frontend/src --include='*.ts' --include='*.tsx'` excluding `lib/api/whatsapp.ts`, `lib/api/whatsapp-helpers.ts`, and `lib/api/index.ts` (barrel re-export). 29 of 35 `whatsapp.ts` exports show **zero real consumers**.

| Symbol | Status |
|---|---|
| `connectWhatsapp` | DELETED — misnamed dead code, ADR-authorized removal (CONNECT_CHANNEL_CANONICAL.md Step 2). Barrel export removed. CAPABILITY_MAP.md updated. |
| `getWhatsAppViewer` | DEAD-but-preserved — returns a static stub; preserve per ADR-0012 ("All other functions stay") until frontend wave begins. |
| `getWhatsAppScreencastToken` | DEAD-but-preserved — returns static `disabled` stub. |
| `performWhatsAppViewerAction` | DEAD-but-preserved — static failure stub. |
| `takeoverWhatsAppViewer` | DEAD-but-preserved — static failure stub. |
| `resumeWhatsAppAgent` | DEAD-but-preserved — static failure stub. |
| `pauseWhatsAppAgent` | DEAD-but-preserved — static failure stub. |
| `reconcileWhatsAppSession` | DEAD-but-preserved — static failure stub. |
| `getWhatsAppProofs` | DEAD-but-preserved — returns `[]`. |
| `runWhatsAppActionTurn` | DEAD-but-preserved — static failure stub. |
| `getWhatsAppSessionDiagnostics` | DEAD-but-preserved — wraps `/whatsapp-api/session/diagnostics`. |
| `forceWhatsAppSessionCheck` | DEAD-but-preserved — wraps `/whatsapp-api/session/force-check`. |
| `forceWhatsAppReconnect` | DEAD-but-preserved — wraps `/whatsapp-api/session/force-reconnect`. |
| `repairWhatsAppSessionConfig` | DEAD-but-preserved — wraps `/whatsapp-api/session/repair-config`. |
| `linkWhatsAppSession` | DEAD-but-preserved — wraps `/whatsapp-api/session/link`. |
| `recreateWhatsAppSessionIfInvalid` | DEAD-but-preserved — wraps `/whatsapp-api/session/recreate-if-invalid`. |
| `getWhatsAppProviderStatus` | DEAD-but-preserved — wraps `/whatsapp-api/provider-status`. |
| `checkWhatsAppPhone` | DEAD-but-preserved — wraps `/whatsapp-api/check/:phone`. |
| `getWhatsAppCatalogContacts` | DEAD-but-preserved — wraps `/whatsapp-api/catalog/contacts`. |
| `getWhatsAppCatalogRanking` | DEAD-but-preserved — wraps `/whatsapp-api/catalog/ranking`. |
| `refreshWhatsAppCatalog` | DEAD-but-preserved — wraps `/whatsapp-api/catalog/refresh`. |
| `scoreWhatsAppCatalog` | DEAD-but-preserved — wraps `/whatsapp-api/catalog/score`. |
| `listWhatsappTemplates` | DEAD-but-preserved — returns `[]`. |
| `whatsappOptIn` | DEAD-but-preserved — POSTs `/whatsapp/:ws/opt-in/bulk`. |
| `whatsappOptOut` | DEAD-but-preserved — POSTs `/whatsapp/:ws/opt-out/bulk`. |
| `whatsappOptStatus` | DEAD-but-preserved — GETs `/whatsapp/:ws/opt-status/:phone`. |
| `buildWhatsAppScreencastWsUrl` | DEAD-but-preserved — ws URL builder. |
| `simulateWhatsAppConversation` | DEAD-but-preserved — POSTs `/kloel/whatsapp/simulate/:ws`. |
| `getWhatsAppBrainStatus` | DEAD-but-preserved — GETs `/kloel/whatsapp/status`. |

**`whatsappApi` object method dead-method list** (9 of 19 methods):

| Method | Status |
|---|---|
| `startSession` | DEAD-but-preserved (superseded by `initiateWhatsAppConnection`). |
| `bootstrapSession` | DEAD-but-preserved. |
| `getCiaIntelligence` | DEAD-but-preserved. |
| `getQrCode` | DEAD-but-preserved (superseded by `getWhatsAppQR` / `getWhatsAppQrImageOnly`). |
| `getViewer` | DEAD-but-preserved. |
| `takeover` | DEAD-but-preserved. |
| `resumeAgent` | DEAD-but-preserved. |
| `performViewerAction` | DEAD-but-preserved. |
| `createContact` | DEAD-but-preserved. |
| `setPresence` | DEAD-but-preserved. |
| `getBacklog` | DEAD-but-preserved. |
| `syncHistory` | DEAD-but-preserved. |

## Duplicate-pair list

Endpoints reachable via **both** `whatsapp.ts` named exports **and** `whatsapp-api.ts` `whatsappApi.*`:

| Endpoint | `whatsapp.ts` export | `whatsappApi.*` method |
|---|---|---|
| `GET /whatsapp-api/session/status` | `getWhatsAppStatus` (16 consumers ✓ active) | `whatsappApi.getStatus` (4 consumers ✓ active) |
| `POST /whatsapp-api/session/start` | `initiateWhatsAppConnection` (11 consumers ✓ active) | `whatsappApi.startSession` (DEAD) |
| `GET /whatsapp-api/session/qr` | `getWhatsAppQrImageOnly` (4 consumers ✓ active) | `whatsappApi.getQrCode` (DEAD) |
| `DELETE /whatsapp-api/session/disconnect` | `disconnectWhatsApp` (5 consumers ✓ active) | `whatsappApi.disconnect` (1 consumer ✓ active) |
| `POST /whatsapp-api/session/logout` | `logoutWhatsApp` (5 consumers ✓ active) | `whatsappApi.logout` (1 consumer ✓ active) |
| `GET /whatsapp-api/session/view` (viewer) | `getWhatsAppViewer` (DEAD, stub) | `whatsappApi.getViewer` (DEAD) |
| `POST /whatsapp-api/session/takeover` | `takeoverWhatsAppViewer` (DEAD, stub) | `whatsappApi.takeover` (DEAD) |
| `POST /whatsapp-api/session/resume-agent` | `resumeWhatsAppAgent` (DEAD, stub) | `whatsappApi.resumeAgent` (DEAD) |
| `POST /whatsapp-api/session/action` | `performWhatsAppViewerAction` (DEAD, stub) | `whatsappApi.performViewerAction` (DEAD) |

Five of the nine duplicate endpoints have both halves alive in production. Two halves return static stubs while their twin returns a real HTTP call.

## Recommendations (frontend Wave proposal — for future authorization)

These changes are **NOT executed in this audit** — only the single ADR-authorized deletion of `connectWhatsapp` ships. Listed for the future "Frontend Wave F-W1" referenced in ADR-0012.

1. **Pick one idiom.** Adopt `whatsappApi.*` object as the canonical client (mirrors backend `MarketingChannelService` shape and matches the rest of the API layer — `authApi`, `billingApi`, `workspaceApi`, etc.). Keep `whatsapp.ts` named exports only for the helpers that already have callers (`getWhatsAppStatus`, `initiateWhatsAppConnection`, `getWhatsAppQR`, `getWhatsAppQrImageOnly`, `disconnectWhatsApp`, `logoutWhatsApp`).
2. **Consolidate the duplicate endpoints** so only one half of each pair exists. Migrate the surviving callers (chat controller, auth provider, WhatsApp console, useWhatsAppSession hook) onto the canonical idiom.
3. **Decide on the static stubs.** The 13 `whatsapp.ts` stub functions (viewer / screencast / proofs / action-turn / pause / resume / reconcile / takeover) all return `success: false` placeholders documenting that the feature is disabled under Meta Cloud. Either:
   - Delete them entirely (zero callers means they're tombstones), or
   - Keep them as the canonical "feature-disabled" facade and route everything through them.
4. **Move catalog + brain helpers** (`getWhatsAppCatalogContacts`, `simulateWhatsAppConversation`, etc.) into purpose-built clients (e.g. `frontend/src/lib/api/whatsapp-catalog.ts`, `frontend/src/lib/api/whatsapp-brain.ts`) so each module has a clear single responsibility.
5. **Rename the module** to `marketing-channel-whatsapp` once the backend wave W3 lands (paths will mirror `marketing/channels/whatsapp`) — but only after backend canonicalization stabilizes.

## What ships now

- Delete `connectWhatsapp` function body + its barrel re-export.
- Update `CAPABILITY_MAP.md` to drop the obsolete row (7→6 implementations).
- Write this audit doc.

## What is intentionally NOT touched

- `getWhatsAppViewer`, `getWhatsAppScreencastToken`, viewer/takeover/resume/pause/proofs/action-turn stubs — preserved per `CONNECT_CHANNEL_CANONICAL.md` line 159: "All other functions (session management, messaging, catalog, brain) stay."
- All `whatsapp-api.ts` `whatsappApi.*` methods — preserved as the public API surface.
- `whatsapp-helpers.ts` — internal utility module, no changes needed.
- `whatsapp-api.test.ts` — preserves the gate-spec coverage on `whatsappApi.getStatus / disconnect / logout / getContacts` + error handling.

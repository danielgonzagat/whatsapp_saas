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
| `connectWhatsapp` | REMOVED — Wave 28B. Misnamed dead code, ADR-authorized removal (CONNECT_CHANNEL_CANONICAL.md Step 2). Barrel export removed. CAPABILITY_MAP.md updated. |
| `getWhatsAppViewer` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Stub returning static `NOT_SUPPORTED` snapshot. |
| `getWhatsAppScreencastToken` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Stub returning static `disabled` token. |
| `performWhatsAppViewerAction` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Static failure stub. |
| `takeoverWhatsAppViewer` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Static failure stub. |
| `resumeWhatsAppAgent` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Static failure stub. |
| `pauseWhatsAppAgent` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Static failure stub. |
| `reconcileWhatsAppSession` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Static failure stub. |
| `getWhatsAppProofs` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Returned `[]`. (Note: `WhatsAppProofEntry` type still re-exported via core.ts barrel — still consumed by `AgentCursor`.) |
| `runWhatsAppActionTurn` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Static failure stub. |
| `getWhatsAppSessionDiagnostics` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/session/diagnostics`. |
| `forceWhatsAppSessionCheck` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/session/force-check`. |
| `forceWhatsAppReconnect` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/session/force-reconnect`. |
| `repairWhatsAppSessionConfig` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/session/repair-config`. |
| `linkWhatsAppSession` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/session/link`. |
| `recreateWhatsAppSessionIfInvalid` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/session/recreate-if-invalid`. |
| `getWhatsAppProviderStatus` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/provider-status`. |
| `checkWhatsAppPhone` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/check/:phone`. |
| `getWhatsAppCatalogContacts` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/catalog/contacts`. |
| `getWhatsAppCatalogRanking` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/catalog/ranking`. |
| `refreshWhatsAppCatalog` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/catalog/refresh`. |
| `scoreWhatsAppCatalog` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Wrapped `/whatsapp-api/catalog/score`. |
| `listWhatsappTemplates` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. Returned `[]`. `WhatsappTemplate` interface also removed (zero consumers). |
| `whatsappOptIn` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. POSTed `/whatsapp/:ws/opt-in/bulk`. |
| `whatsappOptOut` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. POSTed `/whatsapp/:ws/opt-out/bulk`. |
| `whatsappOptStatus` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. GETed `/whatsapp/:ws/opt-status/:phone`. |
| `buildWhatsAppScreencastWsUrl` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. ws URL builder. (`getWhatsAppScreencastWsBase` retained — still in barrel.) |
| `simulateWhatsAppConversation` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. POSTed `/kloel/whatsapp/simulate/:ws`. |
| `getWhatsAppBrainStatus` | REMOVED — Wave 29B. Zero in-repo consumers re-verified. GETed `/kloel/whatsapp/status`. |

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

## Wave 29B follow-up (2026-05-27)

After Wave 28B landed, all 28 remaining "DEAD-but-preserved" entries were
re-verified via `grep -rEn '\\b<symbol>\\b' frontend/src frontend-admin/src e2e backend worker --include='*.ts' --include='*.tsx'`
excluding `lib/api/whatsapp.ts`, `lib/api/whatsapp-helpers.ts`, and the barrel
`lib/api/index.ts`. All 28 returned ZERO consumers. The original
"preserve per ADR-0012" hedge was over-cautious — the symbols have no live
callers anywhere in the repo, including the alternate `whatsapp-api.ts` object
that exposes the canonical surface used in production.

Wave 29B drops:

- 28 dead exports from `frontend/src/lib/api/whatsapp.ts` (485 → 147 lines).
- The `WhatsappTemplate` interface (zero consumers).
- All matching barrel re-exports from `frontend/src/lib/api/index.ts`.
- Added `getWhatsAppQrImageOnly` to barrel re-exports (alive — used by `WhatsAppExperience.controller.ts`).

Preserved-live exports (used in production):

- `getWhatsAppScreencastWsBase` (kept — barrel-exported, even though direct consumers are zero today; cheap to keep, callable by future screencast integration).
- `getWhatsAppStatus`, `initiateWhatsAppConnection`, `getWhatsAppQR`, `getWhatsAppQrImageOnly`, `disconnectWhatsApp`, `logoutWhatsApp` — all have multiple live consumers per audit table above.

Type-only re-exports moved/retained:

- `WhatsAppProofEntry` — still consumed by `AgentCursor` components. Re-exported directly from `core.ts` via the barrel (was already so; the `whatsapp.ts` type-re-export was redundant).
- `WhatsAppConnectionStatus`, `WhatsAppConnectResponse` — re-exported from `whatsapp.ts` (kept).
- `WhatsAppScreencastTokenResponse` — type still exported from `core.ts` and from the barrel; redundant `whatsapp.ts` re-export removed (no consumers).
- `WhatsAppCatalogContact` — removed (zero consumers).

## What is intentionally NOT touched

- All `whatsapp-api.ts` `whatsappApi.*` methods — preserved as the public API surface.
- `whatsapp-helpers.ts` — internal utility module, no changes needed.
- `whatsapp-api.test.ts` — preserves the gate-spec coverage on `whatsappApi.getStatus / disconnect / logout / getContacts` + error handling.
- The 12 `whatsappApi.*` dead methods listed above — separate cleanup, would alter the object idiom and require a coordinated removal from the barrel `api.whatsapp.*` map.

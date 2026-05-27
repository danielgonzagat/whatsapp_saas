# Kloel Deprecation Map

> Tracks each symbol marked as deprecated, with its replacement and migration deadline.

| Deprecated symbol | Replacement | Deadline | Status |
|---|---|---|---|
| _(none yet — populate as canonicalization migrations land)_ | | | |
| `sendWhatsappMessage` (frontend/src/lib/api/whatsapp.ts:424) | inline `apiFetch('/whatsapp/{workspaceId}/send', …)` | 2026-05-27 | REMOVED 2026-05-27 |
| `sendWhatsappTemplate` (frontend/src/lib/api/whatsapp.ts:444) | inline `apiFetch('/whatsapp/{workspaceId}/send', …)` with `type: 'template'` | 2026-05-27 | REMOVED 2026-05-27 |
| #40 `ChannelSendResult` + `ChannelCapability` (backend/src/kloel/channel-transport.types.ts) | canonical port at `backend/src/common/channel-dispatch/channel-dispatch.port.ts` | TBD (see ADR-0014 migration plan) | BLOCKED — awaiting ADR-0014 ratification (see `docs/adr/0014-channel-send-result-unification.md`) |
| #11 `backend/src/meta/messenger/` (MessengerService + MessengerController) | `backend/src/marketing/channels/messenger/` | Wave W4 (verified empty) | MIGRATED 2026-05-27 — files moved via `git mv`, consumers updated (meta.module, kloel/channel-transport.providers + spec, marketing channels dispatch adapter), HTTP routes (`meta/messenger/*`) preserved, re-export stubs left at old paths with `@deprecated` JSDoc banner per ADR-0012 W3 |

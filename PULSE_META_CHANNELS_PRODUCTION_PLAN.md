# PULSE Meta Channels Production Plan

Last updated: 2026-04-22T01:18:00-03:00
Owner: Codex
Scope: Kloel CIA official Meta channels for Marketing, official callbacks/webhooks, and production truth for workspace-scoped connections

Status legend:
- `pending`
- `in_progress`
- `green`
- `blocked_external`

This file is the canonical delivery tracker for the Meta channel production work.
It intentionally records only statuses backed by repository state, live endpoint
validation, or official Meta asset inspection performed on 2026-04-22.

## Current verdict

- WhatsApp official webhook + callback base: `green`
- WhatsApp official asset validation: `green`
- Messenger page webhook base: `green`
- Messenger page subscription for the current live page: `blocked_external`
- Instagram official asset binding: `blocked_external`
- Lead Ads page subscription for the current live page: `green`
- Lead Ads realtime webhook ingestion: `green`
- Marketing WhatsApp official surface (repo/build + live app): `green`
- Marketing Instagram/Facebook dead-end overlay removal (repo/build + live app): `green`
- Multi-tenant page/workspace routing base: `green`
- Human-like quality audit pack: `in_progress`

## Technical checks

### 1. Meta webhook verify endpoint

- Status: `green`
- Evidence: `GET https://api.kloel.com/webhooks/meta?hub.mode=subscribe&hub.verify_token=<production META_VERIFY_TOKEN>&hub.challenge=123456` returned HTTP `200` and body `123456`
- Files affected: [meta-webhook.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/webhooks/meta-webhook.controller.ts:104)
- Routes affected: `GET /webhooks/meta`
- Tests related: live curl verification on 2026-04-22
- Notes: production resolves the verify token from `META_VERIFY_TOKEN` before `META_WEBHOOK_VERIFY_TOKEN`

### 2. Meta webhook signed POST validation

- Status: `green`
- Evidence: signed `POST https://api.kloel.com/webhooks/meta` returned HTTP `200` and body `ok` using the production Meta app secret
- Files affected: [meta-webhook.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/webhooks/meta-webhook.controller.ts:138)
- Routes affected: `POST /webhooks/meta`
- Tests related: live signed webhook smoke on 2026-04-22
- Notes: signature validation uses `X-Hub-Signature-256` and the production `META_APP_SECRET`

### 3. Meta OAuth / Embedded Signup callback route

- Status: `green`
- Evidence: `HEAD https://api.kloel.com/meta/auth/callback` returned HTTP `302` to the frontend error contract when missing params
- Files affected: [meta-auth.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/meta-auth.controller.ts:135), [meta-whatsapp.service.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/meta-whatsapp.service.ts:58)
- Routes affected: `GET /meta/auth/callback`, `GET /meta/auth/url`
- Tests related: live HEAD validation on 2026-04-22
- Notes: current production Embedded Signup config id is `2217262462346828`

### 4. WhatsApp Cloud official webhook object support

- Status: `green`
- Evidence: controller handles Meta object `whatsapp_business_account` and processes `change.field === messages`
- Files affected: [meta-webhook.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/webhooks/meta-webhook.controller.ts:316)
- Routes affected: `POST /webhooks/meta`
- Tests related: live signed webhook smoke; code inspection
- Notes: inbound messages and message statuses share the `messages` change feed in Cloud API

### 5. WhatsApp official asset discovery

- Status: `green`
- Evidence: live Graph checks returned WABA `2848659798820132`, phone number id `1055729897629826`, display phone `+1 555-634-5954`, verified name `Test Number`
- Files affected: [meta-whatsapp.service.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/meta-whatsapp.service.ts:159)
- Routes affected: `GET /meta/auth/status`, `GET /marketing/status`
- Tests related: live Graph API checks on 2026-04-22
- Notes: owner business resolved as `1230634055818028` / `Kloel Inteligencia Comercial Autonoma`

### 6. Messenger page webhook routing by workspace

- Status: `green`
- Evidence: page and Instagram routing resolve workspace from `metaConnection.pageId`
- Files affected: [meta-webhook.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/webhooks/meta-webhook.controller.ts:325)
- Routes affected: `POST /webhooks/meta`
- Tests related: code inspection
- Notes: the current routing base prevents cross-workspace page event leakage when `pageId` is persisted correctly

### 7. Messenger official send/conversation endpoints

- Status: `green`
- Evidence: backend exposes official Messenger send and conversation retrieval endpoints backed by Graph Page messaging
- Files affected: [messenger.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/messenger/messenger.controller.ts:10), [messenger.service.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/messenger/messenger.service.ts:8)
- Routes affected: `POST /meta/messenger/send`, `GET /meta/messenger/conversations`
- Tests related: code inspection
- Notes: page access token is required from the authorized workspace connection

### 8. Instagram official profile/media/insights/send endpoints

- Status: `in_progress`
- Evidence: backend exposes official Instagram profile, media, insights, comment, and message endpoints using workspace Meta connection state
- Files affected: [instagram.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/instagram/instagram.controller.ts:21)
- Routes affected: `GET /meta/instagram/profile`, `GET /meta/instagram/media`, `GET /meta/instagram/insights/account`, `POST /meta/instagram/messages/send`
- Tests related: code inspection
- Notes: endpoint surface exists, but current live asset set lacks a connected Instagram business account

### 9. Instagram asset binding for current live page

- Status: `blocked_external`
- Evidence: live Graph check for page `994971940375552` returned no `instagram_business_account` and no `connected_instagram_account`
- Files affected: [meta-auth.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/meta-auth.controller.ts:198)
- Routes affected: `GET /meta/auth/status`, `GET /marketing/status`
- Tests related: live Graph API checks on 2026-04-22
- Notes: this blocks a truthful green verdict for Instagram DM operations until a professional Instagram account is linked to the Page and reauthorized

### 10. Lead Ads Graph retrieval endpoints

- Status: `green`
- Evidence: backend exposes official Graph retrieval for Page lead forms and form leads
- Files affected: [meta-ads.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/ads/meta-ads.controller.ts:84), [meta-ads.service.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/ads/meta-ads.service.ts:51)
- Routes affected: `GET /meta/ads/leads`, `GET /meta/ads/leads/:formId`
- Tests related: code inspection
- Notes: this is polling / retrieval coverage, not realtime ingestion

### 11. Lead Ads realtime webhook ingestion

- Status: `green`
- Evidence: repository persists realtime `page.leadgen` into `MetaLeadCapture`, the live Page is already subscribed for `leadgen,feed`, and a signed replay against `https://api.kloel.com/webhooks/meta` on 2026-04-22 returned HTTP `200` while production PostgreSQL stored `workspaceId=7972562d-260a-4385-9260-854d7d2b3e4b`, `leadgenId=pulse_live_20260422_0412`, `pageId=994971940375552`, `syncStatus=fetch_failed`
- Files affected: [meta-webhook.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/webhooks/meta-webhook.controller.ts:199), [meta-leadgen.service.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/webhooks/meta-leadgen.service.ts:1), [schema.prisma](/Users/danielpenin/whatsapp_saas/backend/prisma/schema.prisma:2798), [meta-cia-operator-setup.md](/Users/danielpenin/whatsapp_saas/docs/compliance/meta-cia-operator-setup.md:1)
- Routes affected: `POST /webhooks/meta`
- Tests related: `npm --prefix backend run test -- --runInBand src/meta/webhooks/meta-leadgen.service.spec.ts src/meta/webhooks/meta-webhook.controller.spec.ts`, `npm --prefix backend run typecheck`, live Page `subscribed_apps` validation on 2026-04-22, live signed webhook replay plus direct PostgreSQL validation on 2026-04-22
- Notes: the smoke replay intentionally used a routing-only token, so `failureReason=lead_fetch_failed:Invalid OAuth access token - Cannot parse access token` is expected and still proves real production routing, idempotent persistence, and workspace isolation; the smoke row was cleaned up after verification

### 12. Messenger page subscription for the current live page

- Status: `blocked_external`
- Evidence: live `POST /994971940375552/subscribed_apps` with `messages,messaging_postbacks,message_reads,message_deliveries` failed with Meta `(#200)` requiring `pages_messaging`
- Files affected: [meta-auth.controller.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/meta-auth.controller.ts:109), [meta-auth.controller.spec.ts](/Users/danielpenin/whatsapp_saas/backend/src/meta/meta-auth.controller.spec.ts:1), [meta-cia-operator-setup.md](/Users/danielpenin/whatsapp_saas/docs/compliance/meta-cia-operator-setup.md:1)
- Routes affected: `GET /meta/auth/callback`, `POST /meta/auth/disconnect`
- Tests related: live Graph API subscription attempt on 2026-04-22; `npm --prefix backend run test -- --runInBand src/meta/meta-auth.controller.spec.ts`
- Notes: Facebook Messenger cannot be marked green until a token with effective `pages_messaging` can subscribe the Page messaging fields

### 13. Marketing WhatsApp production surface no longer exposes QR in the repository build or live app

- Status: `green`
- Evidence: the Marketing WhatsApp experience now renders an official Meta Cloud onboarding pane instead of a WAHA / QR instruction pane when the provider is Meta Cloud, the new frontend test locks the `sem QR` surface, and a live authenticated browser smoke on `app.kloel.com` confirmed the official pane with no QR instruction after the production backend default was switched to `meta-cloud`
- Files affected: [WhatsAppExperience.tsx](/Users/danielpenin/whatsapp_saas/frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:1), [WhatsAppExperience.test.tsx](/Users/danielpenin/whatsapp_saas/frontend/src/components/kloel/marketing/WhatsAppExperience.test.tsx:1)
- Routes affected: `GET /marketing/whatsapp`
- Tests related: `npm --prefix frontend run test -- src/components/kloel/marketing/WhatsAppExperience.test.tsx`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, live authenticated Playwright smoke on 2026-04-21
- Notes: production `GET /api/whatsapp-api/session/status` for the smoke workspace now returns `provider=meta-cloud`, `authUrl=<official Meta URL>`, and `degradedReason=meta_auth_required`

### 14. Marketing Instagram and Facebook tabs no longer carry dead-end overlays in the repository build or live app

- Status: `green`
- Evidence: `ComingSoonOverlay` was removed from the final render path for `/marketing/instagram` and `/marketing/facebook`, and a live authenticated browser smoke on `app.kloel.com` confirmed both routes now show the real connect prompt instead of a dead-end overlay
- Files affected: [MarketingView.tsx](/Users/danielpenin/whatsapp_saas/frontend/src/components/kloel/marketing/MarketingView.tsx:1938)
- Routes affected: `GET /marketing/instagram`, `GET /marketing/facebook`
- Tests related: `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, live authenticated Playwright smoke on 2026-04-21
- Notes: the current live copy renders `Conectar Instagram` and `Conectar Facebook`; Instagram remains externally blocked by missing Page <-> professional account binding and Messenger remains externally blocked by `pages_messaging`

### 15. Marketing-facing Meta configuration truth

- Status: `green`
- Evidence: app review runbook updated to current live callback and webhook hosts; no secrets committed
- Files affected: [meta-app-review-submission.md](/Users/danielpenin/whatsapp_saas/docs/compliance/meta-app-review-submission.md:56)
- Routes affected: documentation / operator setup
- Tests related: live callback and webhook validation on 2026-04-22
- Notes: repository doc now points to `api.kloel.com` instead of the stale `app.kloel.com/api/...` host pattern

## Human-like quality by channel

### WhatsApp

- Status: `in_progress`
- Evidence: the rebuilt synthetic transcript pack now shows honest disclosure and explicit context carryover on WhatsApp, including `WHA-DISCLOSURE-001` and `WHA-MEMORY-002`
- Files affected: [unified-agent.service.ts](/Users/danielpenin/whatsapp_saas/backend/src/kloel/unified-agent.service.ts:1098), [unified-agent.service.spec.ts](/Users/danielpenin/whatsapp_saas/backend/src/kloel/unified-agent.service.spec.ts:1)
- Routes affected: inbox / autopilot / omnichannel delivery
- Tests related: `npm --prefix backend run test -- --runInBand src/kloel/unified-agent.service.spec.ts`, `npm --prefix backend run typecheck`, synthetic transcript pack on 2026-04-22
- Notes: quality improved materially, but the required scenario breadth is still incomplete for a final green verdict

### Instagram Direct

- Status: `in_progress`
- Evidence: the rebuilt synthetic transcript pack now shows channel-specific short-form Instagram behavior and honest disclosure in `IG-DM-001` and `IG-DISCLOSURE-002`
- Files affected: [unified-agent.service.ts](/Users/danielpenin/whatsapp_saas/backend/src/kloel/unified-agent.service.ts:1098), [unified-agent.service.spec.ts](/Users/danielpenin/whatsapp_saas/backend/src/kloel/unified-agent.service.spec.ts:1)
- Routes affected: Instagram DM surfaces
- Tests related: `npm --prefix backend run test -- --runInBand src/kloel/unified-agent.service.spec.ts`, synthetic transcript pack on 2026-04-22
- Notes: copy quality improved, but live Instagram certification remains externally blocked until the Page has a real professional Instagram account linked and reauthorized

### Facebook Messenger

- Status: `in_progress`
- Evidence: the rebuilt synthetic transcript pack now shows page-style Messenger responses with less robotic name capture and better next-step continuity in `MSG-COMMERCIAL-001` and `MSG-CONTEXT-002`
- Files affected: [unified-agent.service.ts](/Users/danielpenin/whatsapp_saas/backend/src/kloel/unified-agent.service.ts:1098), [unified-agent.service.spec.ts](/Users/danielpenin/whatsapp_saas/backend/src/kloel/unified-agent.service.spec.ts:1)
- Routes affected: Messenger webhook and inbox
- Tests related: `npm --prefix backend run test -- --runInBand src/kloel/unified-agent.service.spec.ts`, synthetic transcript pack on 2026-04-22
- Notes: conversation quality improved, but live Messenger certification remains blocked until a token with effective `pages_messaging` can subscribe the Page messaging fields

## Immediate next verification steps

- Deploy the latest channel-aware responder changes to production so the conversation improvements are live, not just validated in-worktree
- Expand the human-like transcript pack from the current six audited scenarios to the broader acceptance matrix
- Reauthorize a Page that has a real Instagram professional account attached and rerun official Instagram channel smoke
- Re-authorize a token with effective `pages_messaging` and subscribe the Page messaging fields for Messenger
- Expand this plan to the full master checklist as each remaining block is verified or closed

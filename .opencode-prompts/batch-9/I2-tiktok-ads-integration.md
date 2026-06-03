# Wave I/2 — TikTok Ads complete integration (OAuth + Sync + Events API)

## Mission

Same shape as Google Ads but for TikTok:
1. OAuth flow with token refresh + revocation
2. AES-256-GCM token storage
3. BullMQ sync job mirroring Meta/Google pattern
4. Events API (server-side events with hashed PII)

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE INTEGRAÇÕES EXTERNAS + REGRA DE SEGREDOS
3. `AGENTS.md`
4. `backend/src/integrations/tiktok-ads.provider.ts` (184 lines — current state)
5. `backend/src/integrations/meta-marketing.provider.ts` (reference — Wave I/1 done)
6. `backend/src/integrations/ads-sync.processor.ts`

## TikTok Business API v1.3 specifics

- Auth endpoint: `https://business-api.tiktok.com/portal/auth`
- OAuth code → access_token endpoint
- Refresh via `refresh_token` (24h expiry on access, 30d refresh)
- Events API: `https://business-api.tiktok.com/open_api/v1.3/event/track/`

## Required behavior

Mirror Google Ads (see I2-google-ads-integration.md). TikTok-specific:
- App ID + App Secret as env vars
- Advertiser_id scope per workspace
- Events: must include hashed email/phone (SHA-256 lowercase)

## Ownership set

- `backend/src/integrations/tiktok-ads.provider.ts` (extend)
- `backend/src/integrations/tiktok-ads.provider.spec.ts`
- `backend/src/integrations/tiktok-token-crypto.ts` (CREATE if missing)
- `backend/src/integrations/tiktok-events-api.service.ts` (CREATE)
- `backend/src/integrations/ads-sync.processor.ts` (extend with TikTok branches)
- `backend/src/tiktok-ads/tiktok-auth.controller.ts` (CREATE)
- `backend/src/tiktok-ads/tiktok-auth.controller.spec.ts`

## Constraints + DoD + Hard stops

Same as Wave I/2 Google Ads.

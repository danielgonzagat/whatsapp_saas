# Wave I/2 — Google Ads complete integration (OAuth + Token Crypto + Sync + Enhanced Conversions)

## Mission

Audit and complete the Google Ads integration:
1. OAuth flow with token refresh + revocation
2. AES-256-GCM token storage (verify and complete `google-ads-token-crypto.ts` if missing)
3. BullMQ sync job (`ads-sync.processor.ts` already has Meta side via Wave I/1; mirror for Google)
4. Enhanced Conversions API (hashed PII upload)

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE INTEGRAÇÕES EXTERNAS + REGRA DE SEGREDOS
3. `AGENTS.md`
4. `backend/src/integrations/google-ads.provider.ts` (489 lines — current state)
5. `backend/src/integrations/meta-marketing.provider.ts` (reference — Wave I/1 done)
6. `backend/src/integrations/meta-token-crypto.ts` (reference for crypto pattern)
7. `backend/src/integrations/ads-sync.processor.ts`

## Required behavior

### OAuth flow
- Authorization-code with PKCE
- Callback persists `IntegrationCredential` row (workspaceId, accessToken, refreshToken, expiresAt, all encrypted)
- Proactive refresh 5min before expiresAt (BullMQ scheduled)
- Revocation endpoint

### Token crypto
- AES-256-GCM, 12-byte random IV per record, 16-byte auth tag
- Key from `GOOGLE_ADS_TOKEN_ENCRYPTION_KEY` env (32 bytes base64)
- Key versioning (keyVersion column) for rotation

### Sync job
- BullMQ queue `ads-sync-google` (mirror Meta's pattern)
- Retry 5x exponential backoff, DLQ after 5 failures
- Deduplication via jobId `google-sync-${accountId}-${day}`
- Idempotent upserts on (workspaceId, accountId, campaignId, day)
- Rate limit per Google Ads API quota

### Enhanced Conversions API
- Server-side conversion events upload
- PII hashed SHA-256 (email/phone/firstName/lastName)
- developer-token + login-customer-id headers
- Idempotency via event_id

## Ownership set

- `backend/src/integrations/google-ads.provider.ts` (extend)
- `backend/src/integrations/google-ads.provider.spec.ts`
- `backend/src/integrations/google-ads-token-crypto.ts` (CREATE if missing)
- `backend/src/integrations/google-ads-token-crypto.spec.ts`
- `backend/src/integrations/google-ads-enhanced-conversions.service.ts` (CREATE)
- `backend/src/integrations/google-ads-enhanced-conversions.service.spec.ts`
- `backend/src/integrations/ads-sync.processor.ts` (extend with Google branches)
- `backend/src/google-ads/google-ads-auth.controller.ts` (CREATE if missing)
- `backend/src/google-ads/google-ads-auth.controller.spec.ts`

## Constraints

- NO logging accessToken/refreshToken (only first-4 + last-4 masked)
- NO bypass tokens
- NO commits
- AES-GCM (not CBC)

## Definition of Done

- All target files updated/created
- 0 new tsc errors in `backend/src/integrations/google-ads*` and `backend/src/google-ads/`
- `npx jest --testPathPatterns="(integrations/google-ads|google-ads/)"` passes
- AnunciosView gets new sync-status endpoint for `provider=google` (same shape as Meta)
- Report: count of files touched, OAuth flow + Crypto + Sync + EC all wired

## Hard stop conditions

- `GOOGLE_ADS_DEVELOPER_TOKEN` env not set — STOP, report (this is the manual-config blocker)
- `IntegrationCredential` Prisma model missing required fields — STOP, report schema gap
- BullMQ + Redis not wired in env — STOP, report

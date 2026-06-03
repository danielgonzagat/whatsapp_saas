# Wave I / Slice 1 — MetaMarketing Complete (OAuth + Token Crypto + Sync + Webhook + CAPI)

## Mission

Complete the Meta Marketing integration end-to-end:
1. OAuth flow with token refresh + revocation
2. AES-256-GCM token storage encryption (verify existing `meta-token-crypto.ts`)
3. BullMQ sync job with retry/backoff/DLQ per account
4. Meta webhook subscription with signature verification (X-Hub-Signature-256)
5. Conversions API server-side events with hashed PII (SHA-256)

User-facing surface: AnunciosView renders real campaigns/insights from at least
one connected Meta account with timestamp of last sync.

## Ownership set

- `backend/src/integrations/meta-marketing.provider.ts` (281 lines — extend)
- `backend/src/integrations/meta-marketing.provider.spec.ts`
- `backend/src/integrations/meta-token-crypto.ts` (verify AES-256-GCM)
- `backend/src/integrations/meta-token-crypto.spec.ts`
- `backend/src/integrations/ads-sync.processor.ts` (extend)
- `backend/src/integrations/ads-sync.processor.spec.ts`
- `backend/src/meta/meta-auth.controller.ts` (extend or CREATE for OAuth callback)
- `backend/src/meta/meta-auth.controller.spec.ts`
- `backend/src/meta/meta-webhook.controller.ts` (verify signature check; CREATE if missing)
- `backend/src/meta/meta-webhook.controller.spec.ts`
- `backend/src/integrations/meta-conversions-api.service.ts` (CREATE)
- `backend/src/integrations/meta-conversions-api.service.spec.ts`
- `frontend/src/components/kloel/anuncios/AnunciosView.tsx` (verify it renders real data)
- `frontend/src/hooks/useAnunciosCampaigns.ts` (verify hits backend)
- `e2e/specs/meta-marketing-flow.spec.ts` (CREATE) — proves OAuth → connect → sync → render

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE INTEGRAÇÕES EXTERNAS + REGRA DE WHATSAPP / AUTOPILOT
   (Meta SDK is shared).
2. `AGENTS.md`.
3. All target files — full read each.
4. Meta Marketing API docs: https://developers.facebook.com/docs/marketing-api/
5. `backend/prisma/schema.prisma` — sections AdAccount, AdCampaign, AdInsight,
   IntegrationCredential (or equivalent).

## Required behavior

### OAuth flow
- Standard authorization-code flow with PKCE.
- Callback persists `IntegrationCredential` row with workspaceId,
  accountId, accessToken (AES-256-GCM encrypted), refreshToken (encrypted),
  expiresAt.
- Refresh logic: 5 minutes before `expiresAt`, refresh proactively in BullMQ
  scheduled job.
- Revocation endpoint: deletes credential + revokes Meta-side.

### Token crypto
- AES-256-GCM (not CBC). 12-byte IV per record (random). 16-byte auth tag stored
  alongside ciphertext. Key from `META_TOKEN_ENCRYPTION_KEY` env (32 bytes,
  base64).
- KEY ROTATION: encrypted records include `keyVersion`. Service supports
  decrypting with prior version while encrypting with current.

### Sync job
- Runs every 15 minutes per connected account.
- BullMQ queue `ads-sync-meta` with: retry 5x exponential backoff, DLQ
  `ads-sync-meta-dlq` after 5 failures, deduplication by jobId
  `meta-sync-${accountId}-${day}`, rate limit 200 calls/hour per account.
- Idempotent: rerunning the same job over same day window doesn't duplicate
  AdInsight rows. Use `upsert` with unique constraint `(workspaceId, accountId, campaignId, day)`.

### Webhook
- POST `/api/meta/webhook` receives ad events.
- HMAC-SHA256 signature check via `X-Hub-Signature-256` header.
- Reject with 401 if signature mismatch.
- Persist event to `WebhookEvent` with `(provider='meta', externalId)` unique
  to ensure idempotent processing.

### Conversions API
- POST events to `https://graph.facebook.com/v19.0/{pixelId}/events`.
- Hash PII (email/phone/firstName/lastName) with SHA-256 before send.
- Include test_event_code in non-prod.
- Spec covers: hash-correctness, PII not logged plaintext, idempotency by
  event_id, retry on 5xx.

### Frontend
- AnunciosView queries `GET /api/anuncios/campaigns?provider=meta` →
  returns last-synced campaigns + their insights.
- Show last sync timestamp at top of view.
- Show empty/setup state if no Meta account connected, with CTA to OAuth.

## Forbidden moves

- Log accessToken/refreshToken values (only first 4 chars + last 4, masked).
- Bypass signature verification "for testing" — use a test webhook secret env
  in test environment, NEVER bypass.
- Plaintext PII in any log/storage/error path.
- Sync without rate limit — would get account banned.
- Skip idempotency on AdInsight upsert — would inflate cost reports.
- Bypass tokens, new `any`, protected files.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/integrations/meta-* src/meta/meta-*
npx jest --testPathPattern="(meta-marketing|meta-token-crypto|ads-sync|meta-auth|meta-webhook|meta-conversions-api)"

cd ../frontend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l

cd ..
# E2E
pnpm --filter e2e test specs/meta-marketing-flow
```

## Definition of done

- All target files updated/created with full implementation.
- AES-256-GCM verified by reading `meta-token-crypto.ts` and matching to NIST spec.
- BullMQ jobs visible in `/admin/operations/queue-health`.
- Webhook spec passes including signature mismatch rejection.
- CAPI spec passes including hash-correctness.
- AnunciosView renders real data in dev (with fixture Meta account).
- All specs ≥80% coverage on touched files.
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass tokens, no protected files, no commits.

## Hard stop conditions

- If `IntegrationCredential` Prisma model doesn't exist or doesn't have the
  needed fields (workspaceId, provider, encryptedAccessToken,
  encryptedRefreshToken, expiresAt, keyVersion) — STOP, report (schema fix
  separate slice).
- If `META_TOKEN_ENCRYPTION_KEY` env not set or not 32 bytes — STOP, report.
- If Meta App ID / App Secret env not set — STOP, report.
- If BullMQ + Redis not wired — STOP, report.

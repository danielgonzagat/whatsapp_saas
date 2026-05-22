# Wave H/Coverage — Auth + Marketing + Meta + AiBrain (~17 specs)

## Mission

Create `.spec.ts` files for backend services without coverage in auth/, marketing/, meta/, ai-brain/ modules.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE AUTH + REGRA DE INTEGRAÇÕES EXTERNAS + REGRA DE SEGREDOS
3. `AGENTS.md`

## Target slices

### Coverage-Auth (9 services)
- auth-oauth-resolver, auth-oauth, auth-partner, auth-verification
- auth-whatsapp-password, auth.password, db-init-error, rate-limit, user-name-derivation

### Coverage-Marketing (5 services)
- email-marketing, facebook-messenger, instagram-marketing, tiktok-ads, tiktok-marketing

### Coverage-Meta (4 services)
- meta-ads, instagram, messenger, meta-sdk

### Coverage-AiBrain (3 services)
- hidden-data, media-factory, vector

## Special invariants

### Auth
- Never log tokens / passwords (verify no `Logger.log` calls leak)
- JWT verification preserved
- Session lifecycle (login → refresh → revoke) tested
- Rate-limit on login (5/min per IP) tested

### Marketing
- Token crypto AES-256-GCM (mailbox-token-crypto pattern)
- OAuth flow tested

### Meta
- Webhook signature verification (X-Hub-Signature-256)
- Token masking (first-4 + last-4 only)

### AiBrain
- Mock OpenAI / vector DB calls
- PII handling in vectors

## Ownership set

ONLY `backend/src/{auth,marketing,meta,ai-brain}/**/*.spec.ts` (CREATE).

## Constraints + DoD + Hard stops

Same as Wave H/Coverage-Kloel. Specific gate: each service has ≥3 tests, ≥70% line coverage.

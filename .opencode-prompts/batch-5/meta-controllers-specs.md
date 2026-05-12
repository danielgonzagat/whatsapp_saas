# Wave I/1.5 — Meta controllers spec compile fixes

## Mission

Two meta controller spec files (`meta-auth.controller.spec.ts`, `meta-webhook.controller.spec.ts`) were left in compile-error state by Wave I/1 SIGKILL. Fix compile errors and make tests pass.

## Target files (DO NOT modify the .controller.ts, only the .spec.ts)

- `backend/src/meta/meta-auth.controller.spec.ts`
- `backend/src/meta/meta-webhook.controller.spec.ts`

Known compile error (from `npx jest src/meta/meta-webhook.controller.spec.ts`):

```
src/meta/meta-webhook.controller.spec.ts:28:7 - error TS2554: Expected 1 arguments, but got 2.
```

This is a controller constructor signature mismatch — the spec instantiates with 2 args but the controller takes 1 (or vice versa). Read the controller source to find the actual signature, then align the spec.

## Method

1. `cd /Users/danielpenin/whatsapp_saas/backend && npx tsc --noEmit 2>&1 | grep src/meta/meta-(auth|webhook).controller.spec.ts` — list all compile errors
2. Read the `meta-auth.controller.ts` and `meta-webhook.controller.ts` services in full
3. Fix spec to match the actual controller dependency-injection contract
4. `npx jest src/meta/meta-auth.controller.spec.ts src/meta/meta-webhook.controller.spec.ts` — make all tests pass
5. `npx eslint <files>` clean
6. Verify webhook signature spec is present:
   - HMAC-SHA256 verification via `X-Hub-Signature-256` header
   - Reject 401 on signature mismatch
   - Idempotent processing (verify `(provider='meta', externalId)` unique constraint enforcement in WebhookEvent persistence)
   - NEVER bypass signature check "for testing" — use a test webhook secret env, never bypass

## Constraints (CLAUDE.md)

- NO `--no-verify`, NO bypass tokens (`@ts-ignore`, etc.)
- NO modifying the actual controller implementations
- NO commits
- Sensitive: Meta webhook handles ad/page events; verify NO accessToken/refreshToken leak in any log path (only first-4 + last-4 masked)

## Definition of Done

- Both spec files compile (no tsc errors)
- All tests pass
- ESLint clean
- Webhook signature verification tested with rejection case
- Report list of fixed errors

## Hard stop conditions

- Controller has real signature bug discovered via spec — STOP, report
- Webhook requires real Meta App Secret to test — STOP, report env gap

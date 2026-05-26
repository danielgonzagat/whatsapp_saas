# Wave 21 — /auth/refresh Runtime-Cascade Root-Cause + Harden

> Authored by PI atomic subagent `w21-auth-refresh-hotcluster` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26
**Hot Cluster:** `runtime backend /auth/refresh` (composite score 43; errors+10; error-rate+33)

---

## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/auth/auth-service.tokens.ts` | `refreshToken()` rewritten: atomic claim with `updateMany` + `revoked: false` guard, structured logging with `tokenHash`/`workspaceId`, error classification (401 vs 503), try/catch on `issueTokens` |
| `backend/src/auth/auth.token.service.ts` | `AuthTokenService.refresh()` hardened in parallel: `tokenHash` logging, DB error → 503 wrapping, `issueTokens` try/catch with error classification |
| `backend/src/auth/auth.token.service.spec.ts` | +3 test cases: DB lookup failure → 503, atomic claim failure → 503, token issuance failure after claim → 503 |## 2. Diagnosed Root Causes

### 2.1 Race Condition — No Atomic Claim Guard (CRITICAL)

**`auth-service.tokens.ts`** (the production code path via `auth.service.ts` → `auth.controller.ts`) used a bare `prisma.refreshToken.update()` without a `revoked: false` guard:

```typescript
// BEFORE (broken)
await prisma.refreshToken.update({
  where: { id: stored.id },
  data: { revoked: true },
});
```

Two concurrent `/auth/refresh` calls with the same token would both pass the `!stored.revoked` check (race window), both succeed with the update (idempotent, no guard), and both proceed to `issueTokens()` — issuing two active refresh tokens for the same rotation.

**Fix:** Replaced with `updateMany({ where: { id, revoked: false } })` + count check. Only the race winner proceeds; the loser gets a logged 401.

### 2.2 No Structured Logging (HIGH)

No `workspaceId` or `tokenHash` in error paths. Production incidents were undiagnosable — the generic message "Refresh token inválido ou expirado" covered expiry, replay, and DB lookup failures identically.

**Fix:** Every error/success path now logs `tokenHash` (SHA-256 of the raw token), `agentId`, and `workspaceId` via `buildAuthLogMessage()`. Raw tokens are never logged.

### 2.3 Missing Error Classification (HIGH)

DB connectivity errors (`P1001`, `P1002`, `PrismaClientInitializationError`) propagated as raw 500 instead of 503. `issueTokens()` failures (JWT sign, workspace lookup) after a successful claim also propagated as 500.

**Fix:** All DB operations wrapped in try/catch. Generic errors converted to `ServiceUnavailableException` (503). `UnauthorizedException` (401) preserved for auth-specific rejections.

### 2.4 No try/catch on `issueTokens` Post-Claim (MEDIUM)

After successfully claiming a token, `issueTokens()` was called without error handling. If workspace lookup or JWT signing failed, the raw 500 escaped while the token was already revoked — the user lost their session with no recovery path.

**Fix:** `issueTokens()` call wrapped in try/catch. NestJS exceptions propagated as-is; everything else converted to 503.## 3. Backend tsc Result

```
$ npx tsc --noEmit 2>&1 | grep "^src/auth/"
(no output — zero type errors in auth module)
```

Pre-existing type errors exist in `src/kloel/` (unrelated to this change).## 4. Spec Result

```
PASS src/auth/auth.token.service.spec.ts
  AuthTokenService
    refresh
      ✓ should issue new tokens with valid refresh token       (valid refresh → 200)
      ✓ should throw when refresh token not found              (invalid → 401)
      ✓ should throw when refresh token is revoked             (invalid → 401)
      ✓ should throw when refresh token is expired             (expired → 401)
      ✓ should detect and revoke replayed refresh tokens
      ✓ should throw when agent is deleted
      ✓ should throw when agent is disabled
      ✓ should revoke old token before issuing new pair
      ✓ should reject concurrent refresh (race winner only)
      ✓ should return 503 when DB lookup fails (storage error)     ← NEW
      ✓ should return 503 when atomic claim fails (storage error)   ← NEW
      ✓ should return 503 when token issuance fails                 ← NEW

Tests:       22 passed, 22 total
Full auth suite: 24 suites, 249 tests, all passing.
```## 5. Verification Plan

### Sentry Query (post-deploy, 24h window)

```
is:unresolved level:error message:"Refresh token*" OR message:"refresh_token_*"
```

**Expected:** Error rate on `/auth/refresh` drops from current baseline. Remaining errors should be genuine 401s (expired/revoked tokens), not 500s.

### Railway / Structured Log Query

```
{ $.event = "refresh_token_*" }
```

**Confirm:**
- `refresh_token_success` events appear with `workspaceId` and `agentId`.
- `refresh_token_expired` events dominate (natural expiry, not a bug).
- `refresh_token_replay_or_race` events are rare (< 1% of refresh calls).
- `refresh_token_db_transaction_failed` events are absent (would indicate DB outage).

### Key Metric

`count(refresh_token_db_transaction_failed) / count(refresh_token_*)` **MUST** be 0 in steady state. Any non-zero value indicates a DB connectivity issue that needs immediate attention — these were previously invisible 500s.

## 6. Architecture Note

This codebase has **two parallel implementations** of refresh-token rotation:

| | `auth-service.tokens.ts` | `auth.token.service.ts` (`AuthTokenService`) |
|---|---|---|
| **Used by** | `auth.service.ts` → `auth.controller.ts` (production) | Spec tests only |
| **Transaction** | None | `$transaction` + `Serializable` |
| **Redis JTI** | No | Yes (`revokeAccessToken`) |
| **OpsAlert** | No | Yes |
| **Token hash** | Added in this PR | Added in this PR |

Both were hardened in this PR. The production path (`auth-service.tokens.ts`) received the critical atomic claim fix. Long-term: consider consolidating onto `AuthTokenService` with DI wiring in `auth.service.ts`.
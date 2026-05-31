# Auth + KYC — identity, sessions, and the Connect-gated payout unlock

One-line purpose: let a person create/own a KLOEL account (email, OAuth, magic-link, WhatsApp), keep them logged in with rotating JWTs, and verify their real-world identity (KYC) strictly enough to unlock money movement.

This doc covers **two adjacent territories** that live in `backend/src/auth/` and `backend/src/kyc/`:

- **Auth** — who you are + an active session.
- **KYC** — proving who you are well enough to receive payouts. KYC approval is the gate in front of the wallet/affiliate money flows.

---

## What the user does

**Auth (plain language):**
- Sign up with email + password, or with Google / Facebook / Apple / TikTok, or with a passwordless magic link emailed to them, or with a WhatsApp one-time code.
- Log in, stay logged in across tabs/days, log out everywhere.
- Reset a forgotten password; verify their email; mark the product onboarding as "done".

**KYC (plain language):**
- Fill in their profile (name, document, birth date), fiscal/tax data, bank account, and upload identity documents.
- Submit it for verification. Behind the scenes this creates and submits a Stripe Connect account. Only when Stripe says the account is fully usable (can accept charges + receive payouts, nothing still missing) does the account flip to **approved** — which is what lets them withdraw money from their wallet.

---

## End-to-end flow

### A. Email login (representative request, follow it end-to-end)

1. UI form → frontend api client `frontend/src/lib/api/auth.ts` (`authApi.login`, uses `apiFetch` from `frontend/src/lib/api/core.ts`).
2. Next.js proxy route `frontend/src/app/api/auth/login/route.ts` `POST` → forwards to backend `${BACKEND_URL}/auth/login`, then on success calls `setSharedAuthCookies(...)` (`frontend/src/app/api/auth/_lib/shared-auth-cookies.ts`).
3. Nest controller `backend/src/auth/auth.controller.ts` → `AuthController.login` (`@Public() @Post('login')`).
4. Service `backend/src/auth/auth.service.ts` → `AuthService.login` → delegates to `login(...)` in `backend/src/auth/auth-service.register-login.ts`. That helper rate-limits (per-IP and per-IP+email via `RateLimitService`), looks up the agent, bcrypt-compares the password, and calls token issuance.
5. Token issuance → `backend/src/auth/auth.token.service.ts` → `AuthTokenService.issueTokens`: signs a JWT access token (with `sub`, `jti`, `email`, `workspaceId`, `role`) and **rotates** the refresh token inside a Serializable transaction (revoke prior active rows + insert the new one).
6. Prisma models `Agent` + `RefreshToken` → DB tables `RAC_Agent`, `RAC_RefreshToken`.
7. Response `{ access_token, refresh_token, user, workspace, workspaces, isNewUser }` → proxy stores tokens in cookies → UI persists via `tokenStorage` and `mutate('auth')`.
8. UI states: success (redirect to dashboard), `401` invalid credentials, `429` rate-limited, `503` DB/workspace inconsistency (friendly message).

### B. Authenticated request (e.g. `GET /auth/me`)

Every non-`@Public()` route passes the **global** `JwtAuthGuard` (`backend/src/auth/jwt-auth.guard.ts`): extracts `Bearer` token, verifies signature, checks the Redis JTI blacklist (`jti:revoked:<jti>`), and sets `request.user = decoded`. `AuthController.getMe` → `AuthService.getMe` reads the `Agent` and returns the profile + onboarding status.

### C. Token refresh (the hard part)

`POST /auth/refresh` (`@Public`) → `AuthController.refresh` → `AuthService.refresh` → `AuthTokenService.refresh`. It does an **atomic claim** under Serializable isolation (only one concurrent refresh wins the right to revoke the token), with a one-shot P2034 retry, a 15s grace window to distinguish a cross-tab race-loser from a true replay, and sibling-token sweeping on detected replay. This is the most safety-critical code in the territory.

### D. KYC submit → approval

1. UI (`frontend/src/hooks/useKyc.ts` + `frontend/src/lib/api/kyc.ts`) → Next proxy `frontend/src/app/api/kyc/[...path]/route.ts` (catch-all, forwards `Authorization` + `x-workspace-id`) → backend `/kyc/*`.
2. Controller `backend/src/kyc/kyc.controller.ts` (`@UseGuards(JwtAuthGuard, WorkspaceGuard)`) — fill profile (`PATCH /kyc/profile`), fiscal (`PUT /kyc/fiscal`), bank (`PUT /kyc/bank`), upload docs (`POST /kyc/documents/upload`), then `POST /kyc/submit` → `KycController.submitKyc`.
3. Service `backend/src/kyc/kyc.service.ts` → `KycService.submitKyc`: requires `getCompletion(...).percentage === 100`, sets `kycStatus = 'submitted'` (guarded transaction), then calls `syncSellerConnectOnboarding(...)` in `backend/src/kyc/kyc.connect-onboarding.ts` which builds the Stripe Connect profile from `Agent` + `FiscalData` + `BankAccount` and submits it via `ConnectService`.
4. Approval gate: `isConnectKycApproved(status)` is the **only** approval source of truth — requires `chargesEnabled && payoutsEnabled && requirementsCurrentlyDue.length === 0`. If true, `kycStatus = 'approved'` + `kycApprovedAt` set; otherwise stays `submitted`/`pending`. Emits `commerce.kyc.document_submitted` and (on approval) `commerce.kyc.approved` via `KycEventEmitterService`.
5. Models `Agent` (kyc fields), `FiscalData` (`RAC_FiscalData`), `BankAccount` (`RAC_BankAccount`), `KycDocument` (`RAC_KycDocument`).
6. The unlock: `@KycRequired()` + `KycApprovedGuard` (`backend/src/kyc/kyc-approved.guard.ts`) gate the wallet (`backend/src/kloel/wallet.controller.ts`) and affiliate (`backend/src/affiliate/affiliate.controller.ts`) routes — fail-closed (no user / not 'approved' → `403 kyc_not_approved`).

---

## Canonical vocabulary

| Concept | Canonical name | Notes / aliases |
|---|---|---|
| The user/identity entity | **`Agent`** (Prisma model → table `RAC_Agent`) | "user" is the frontend/UX word; the DB entity is `Agent`. Method params use `agentId`. |
| Long-lived session credential | **`RefreshToken`** (`RAC_RefreshToken`) | rotated on every issue; opaque random string, not a JWT. |
| Short-lived API credential | **access token (JWT)** | carries `sub=agentId`, `jti`, `workspaceId`, `role`. |
| KYC verification state | **`kycStatus`** ∈ `pending` → `submitted` → `approved` / `rejected` | string field on `Agent`. |
| The ONLY approval truth | **`isConnectKycApproved`** (Stripe Connect fully enabled) | self-reported form completion is never sufficient. |
| Identity provider login | **OAuth** (`google` / `facebook` / `apple` / `tiktok`) | legacy `POST /auth/oauth` is deprecated and returns an error. |
| Refresh ownership service | **`AuthTokenService`** | the legacy `refreshToken()` in `auth-service.tokens.ts` is `@deprecated` fallback only. |

Lingering aliases: the auth payload exposes both snake_case (`access_token`) and camelCase (`accessToken`) for frontend compatibility — both are intentional, consumed by `frontend/src/lib/api/auth.ts`.

---

## Key services & single responsibility

- **`AuthService`** (`auth.service.ts`) — thin facade; composes the split helper modules (`auth-service.*.ts`) and fires fire-and-forget welcome emails.
- **`AuthTokenService`** (`auth.token.service.ts`) — owns JWT signing, refresh-token rotation, atomic refresh claim, and access-token JTI revocation (Redis).
- **`JwtAuthGuard`** (`jwt-auth.guard.ts`) — global guard; verifies JWT + JTI blacklist; honors `@Public()`.
- **`RateLimitService`** (`rate-limit.service.ts`) — per-key throttling for register/login/anonymous.
- Provider services — `GoogleAuthService`, `FacebookAuthService`, `AppleAuthService`, `TikTokAuthService` — verify provider tokens.
- **`EmailService`** (`email.service.ts`) — sends magic-link / verification / reset emails.
- **`KycService`** (`kyc.service.ts`) — owns profile/fiscal/bank/document CRUD, completion %, submit, and admin approve.
- **`syncSellerConnectOnboarding` / `isConnectKycApproved` / `doApproveIfConnectEnabled`** (`kyc.connect-onboarding.ts`) — the Stripe-Connect-gated approval logic.
- **`KycApprovedGuard`** (`kyc-approved.guard.ts`) — fail-closed gate enforcing `kycStatus === 'approved'` on money routes.
- **`KycEventEmitterService`** (`backend/src/kloel/kyc-emitter/kyc-event-emitter.service.ts`) — emits KYC events onto the event spine.

---

## Data & events

**Prisma models owned/used:** `Agent` (auth + kyc fields), `RefreshToken`, `PasswordResetToken`, `MagicLinkToken`, `SocialAccount` (all `RAC_*`-mapped), plus KYC's `FiscalData`, `BankAccount`, `KycDocument`. Approval reads `ConnectAccountBalance` (accountType `SELLER`) to find the Stripe account.

**Events emitted** (via the spine, `commerce` domain — confirmed in asyncapi):
- `commerce.kyc.document_submitted` — on submit.
- `commerce.kyc.approved` — on auto- or admin-approval (`mode: 'auto' | 'admin'`).
- `commerce.kyc.rejected` — emitter exists; no caller wires rejection yet (see Honest status).

Auth emits no spine events; it triggers side effects directly (welcome email, OpsAlert on critical errors).

---

## Workspace isolation

Every JWT carries `workspaceId`. KYC routes use `WorkspaceGuard` + the `x-workspace-id` header (propagated by the proxy). KYC service methods take `workspaceId` and scope writes with compound `where: { id: agentId, workspaceId }` (e.g. `submitKyc`, `completeOnboarding`, `adminApprove` via the transaction). Fiscal/bank/connect lookups are `where: { workspaceId }`. The `Agent` → `Workspace` relation cascades on delete. `adminApprove` route is additionally role-gated (`req.user.role === 'ADMIN'`).

---

## Honest status

**Works in production (real, tested):**
- Email register/login/refresh/logout with bcrypt + rotating refresh tokens; the refresh path's concurrency safety (atomic claim, P2034 retry, grace window, replay sweep) is non-trivial and has dedicated specs (`auth.token.service.spec.ts`, `auth.service.spec.ts`).
- Global JWT guard + Redis JTI blacklist for logout/revocation.
- OAuth (Google/Facebook/Apple/TikTok), magic-link, WhatsApp code, forgot/reset, email verification — all have controller routes, services, and spec files.
- KYC CRUD + completion + submit, and the Stripe-Connect-gated approval (`isConnectKycApproved`) — fail-closed and covered by `kyc.service.spec.ts` + `kyc-approved.guard.spec.ts`. This gating is the correct, conservative money-safety design.

**Facade / unproven / gaps (be honest):**
- PULSE flags both surfaces as `partial, completion=50%` blocked on **missing live runtime evidence** ("Runtime probe auth-session / backend-health still missing from live evidence") — i.e. unit-tested but not proven against a live deployment. Not a code bug; needs deploy + probe.
- `commerce.kyc.rejected` event has an emitter but **no production caller** — there is no rejection flow wired today (only approve/auto-approve). Rejection is effectively unimplemented.
- `POST /auth/oauth` (legacy) intentionally returns an error — dead route kept for compatibility.
- Approval depends entirely on live Stripe Connect status; in environments without Connect configured, sellers stay `submitted` forever (correct by design, but means E2E approval is unprovable locally without Stripe test mode).
- WAHA WhatsApp transport is intentionally excluded/deprecated here (auth's WhatsApp code path is a separate concern from the WAHA inbound transport).

---

## Start here

1. `backend/src/auth/auth.token.service.ts` — the heart of session safety (issue + refresh + revoke). Read this first; the concurrency comments explain the design.
2. `backend/src/kyc/kyc.connect-onboarding.ts` — the `isConnectKycApproved` gate and Stripe Connect submission; this is what "KYC approved" really means.
3. `backend/src/auth/auth.controller.ts` + `backend/src/kyc/kyc.controller.ts` — the full route surface and which routes are `@Public()` vs guarded.

# KLOEL Handoff

Last updated: 2026-04-19

## What is already implemented in this worktree

### Auth and identity

- Facebook login is wired through the frontend SDK and backend token verification flow.
- Google login remains active and validated through the existing backend service.
- Apple web callback route now exists in the frontend proxy layer and returns users to the app or auth surface with explicit outcome codes.
- Magic-link request and consume endpoints now exist and are wired to frontend login surfaces.
- Existing Kloel accounts now require a one-click magic-link confirmation before a new Google/Facebook/Apple identity is merged into the same email account.
- Social identities are now persisted separately from the legacy `Agent.provider` fields so one Kloel user can keep more than one social login over time.
- Auth UI exposes Google, Facebook, Apple-prepared, and magic-link entry points.
- Frontend auth proxies now fail explicitly with `503` when `BACKEND_URL` is missing instead of degrading into relative `fetch('/auth/...')` errors, and shared-auth cookie hydration now accepts both `access_token` and `accessToken` payload shapes across register, login, Google, Facebook, refresh, magic-link consume, Apple callback, and WhatsApp verify flows.
- Settings > Conta now uses live account data for avatar initials, supports authenticated password changes, sends a real password-reset email, and exposes a real refresh-token session inventory with current-device sign-out, per-device revoke, and "encerrar outras sessões".
- The legacy `ContaView` security surface now reuses the same live session inventory and canonical Kloel sign-out path instead of showing a placeholder “Sessões ativas” card or clearing only local storage.
- New auth routes now exist for session security controls: `GET /auth/sessions`, `POST /auth/sessions/revoke-current`, `POST /auth/sessions/revoke-others`, and `POST /auth/sessions/revoke`.
- Refresh tokens are now stored hashed at rest, not in plaintext, and legacy plaintext rows are still accepted during rotation as a backward-compatible fallback.
- Password reset tokens, magic-link tokens, pending OAuth link-intent tokens, and email-verification tokens are now stored hashed at rest while the raw token remains visible only in the email URL or dev-only response payload.

### Checkout improvements

- Checkout social identity capture now supports Facebook in addition to Google.
- Checkout social identity capture now supports Apple as a first-class checkout flow through the existing Apple callback surface, returning the buyer to the same pay page and reusing the device-bound prefill lookup.
- Manual card entry now lives inside a native `<form>`.
- Canonical browser `autocomplete` attributes were added for identity, address, and card fields.
- Stripe checkout now renders an Express Checkout wallet lane above the Payment Element when Apple Pay / Google Pay are available on the buyer device.
- The Google extended-consent checkout prefill now uses the public feature flag contract and exposes a dismissible "Preenchido via Google" badge that suppresses sensitive address/phone re-hydration for the rest of the session.
- Authenticated Kloel sessions can now reuse the same Google incremental-consent token in checkout through `/api/user/google-profile-extended`, so logged-in buyers hydrate phone/address from the account-scoped People API path before falling back to the public lead endpoint.
- Meta checkout pixel access tokens are now encrypted at rest, operator responses expose only masked previews, and empty updates no longer wipe an existing token accidentally.
- Public checkout payloads now strip pixel access tokens before they leave the backend, so browser-facing checkout JSON never leaks Meta CAPI secrets.

### Compliance

- Public legal pages exist in PT-BR and English for privacy, terms, and data deletion.
- Data deletion status page exists.
- Authenticated settings now expose a self-service privacy zone with:
  - structured JSON data export
  - explicit self-service account deletion confirmation
  - redirect to the public deletion status page after confirmation
- Backend compliance callbacks exist for:
  - Facebook data deletion
  - Facebook deauthorize
  - Google RISC
  - user data export
  - user self-deletion
- Facebook data deletion now resolves the linked Kloel user, purges the account immediately when a match exists, and marks the public status page request as completed instead of leaving it pending forever.
- Facebook deauthorize now removes linked `SocialAccount` records and only clears the primary auth identity when Facebook was the active login provider.
- Google RISC identity resolution now follows linked `SocialAccount` rows as well as the legacy `Agent.provider/providerId` fields, so account-protection callbacks still work after provider linking.
- Authenticated data export now includes social identities, compliance state, prior deletion requests, and sanitized session metadata without leaking raw refresh tokens.
- Google RISC `account-purged` now performs a silent compliance purge directly instead of masquerading as a self-service deletion request or sending the user a confirmation email.
- Meta webhook verification token handling was aligned so production can use `META_WEBHOOK_VERIFY_TOKEN` or `META_VERIFY_TOKEN`.
- Meta connection access tokens are encrypted at rest before persistence and decrypted only at the runtime edge that needs to talk to the Graph API.
- Meta Ads, Instagram, and Messenger admin endpoints now resolve Graph credentials from the encrypted workspace connection on the server side; the browser no longer sends Graph access tokens or page tokens back to the API.
- Workspace HTTP responses (`GET /workspace/me`, `GET /workspace/:id`, `GET /workspace/:id/settings`, and workspace update routes) now sanitize `providerSettings` recursively before leaving the backend, so calendar credentials, API keys, Graph tokens, and other nested secrets do not leak through the account/settings surface.
- Workspace calendar credentials written through `patchSettings` are now encrypted at rest, and the runtime calendar service transparently decrypts them while keeping legacy plaintext rows readable during migration.
- Public API keys are now stored hashed at rest, API-key validation accepts legacy plaintext rows while migrating them forward, list/delete responses never echo the secret, and the raw key is exposed only once in the immediate create response.
- Outbound webhook subscription secrets are now encrypted at rest, decrypted only when the dispatcher enqueues delivery jobs, and the CRUD surface exposes only `secretPreview`/`hasSecret` after the first create response.
- Push device tokens are now stored hashed at rest with encrypted ciphertext for runtime delivery, registration returns only `{ deviceId }`, legacy plaintext rows migrate forward on re-registration/unregister, and invalid-token cleanup now deletes by row id instead of raw token value.
- Collaborator invite tokens are now hashed at rest before persistence, and collaborator invite payloads continue to exclude raw tokens from list/create responses.
- Data-deletion confirmation codes are now stored hashed at rest, the public status page resolves hashed and legacy plaintext rows, and users still receive the raw one-time code only in the immediate URL/email surface.
- Team invitation tokens are now hashed at rest, accept flow keeps legacy plaintext fallback, and invite/create responses no longer expose the raw token.
- Push device unregister logs no longer print device-token fragments.

### Meta-only WhatsApp runtime

- Marketing onboarding no longer assumes QR by default and now opens the official Meta flow.
- Embedded Signup now reads `META_EMBEDDED_SIGNUP_CONFIG_ID` as the primary env name, with `META_CONFIG_ID` kept only as a backward-compatible fallback.
- `GET /meta/auth/url` now returns an explicit `503` when Meta Embedded Signup is not configured, instead of emitting an empty OAuth URL that the frontend would try to open.
- Legacy public WAHA/browser routes for QR and viewer actions now return `410 Gone` with a Meta migration message.
- The deprecated side console copy was updated to stop instructing users to scan a QR code.
- The Meta webhook now rejects unsigned POST deliveries whenever `META_APP_SECRET` is configured.
- Runtime surfaces now expose live WhatsApp phone health from Meta, including `quality_rating`, code verification, and name approval state.
- The shared WhatsApp session hook no longer polls the deprecated QR endpoint while a Meta connection is pending; it now reuses the official status surface only.
- WhatsApp catchup, degraded-sync, and remote-inline fallback copy no longer tells operators to use WAHA or scan QR codes; the runtime now speaks in Meta-first / official WhatsApp terms.
- Worker-side WhatsApp provider routing now respects a persisted `workspace.whatsappProvider` override before falling back to `WHATSAPP_PROVIDER_DEFAULT`, matching backend precedence across the engine, unified provider, API proxy provider, autopilot workspace builder, and provider registry.
- The disabled viewer/browser fallback now reports itself as `meta-cloud` instead of the legacy `whatsapp-api`, keeping frontend runtime contracts aligned with the Meta-only product surface.
- Deprecated QR helpers now return local Meta-first sentinels without calling `/session/qr`, so frontend regressions cannot silently revive the dead proxy route.
- The remaining deprecated App Router routes (`session/view`, `session/link`, `session/claim`, `session/action`, `session/takeover`, `session/resume-agent`, `session/pause-agent`, `session/stream-token`, and `session/action-turn`) are now frozen behind local `410 Gone` Meta-first sentinels with dedicated route tests.
- The leftover legacy QR pane no longer instructs operators to scan a code and now renders as a diagnostic-only legacy snapshot surface in Terminator styling.
- The last misleading QR naming in the marketing surface was removed: the diagnostic pane is now explicitly a legacy-runtime snapshot surface rather than a QR pane.
- The shared WhatsApp session hook now sanitizes legacy runtime payloads defensively before they reach React state, forcing `legacy-runtime`, `connecting`, and stripped QR/viewer/browser fields even if an unsanitized payload slips past the API layer.
- The public `POST /whatsapp-api/session/start` contract is now treated as Meta-only/message-only at the client boundary; stale `qrCode` fields from older payloads are ignored and never propagated to React.
- When a workspace still points at the legacy runtime, `POST /whatsapp-api/session/start` now returns the official Meta Embedded Signup URL so the operator is redirected into the supported connection path instead of getting stuck in a dead legacy start flow.
- If the server is missing Meta Embedded Signup configuration, that same legacy `session/start` path now fails explicitly with `meta_embedded_signup_not_configured` instead of hanging in a false pending state.
- Legacy client helpers no longer hit dead routes for viewer/session-claim/manual-link flows; they now return local Meta-first sentinels immediately, keeping React and auth flows off the deprecated network surface.
- The auth bootstrap/login flow no longer tries to claim a guest WhatsApp session after authentication, and the old guest-claim localStorage path was removed entirely because that legacy upgrade path no longer exists in Meta-first mode.
- `Settings > Conta` now normalizes any persisted legacy WhatsApp provider back to `meta-cloud` before saving, so the channels form cannot write `whatsapp-api` back into workspace settings.
- The shared WhatsApp session hook no longer exposes legacy QR snapshots from the status payload, preventing future UI reuse of stale QR data.
- Marketing connect status now exposes `legacy-runtime` instead of the raw `whatsapp-api` token, and the onboarding surface recognizes that token explicitly.
- Workspace settings/account payloads now expose `legacy-runtime` instead of the raw `whatsapp-api` token, including the nested `whatsappApiSession.provider` field returned to the browser.
- `/whatsapp-api/session/status` now normalizes legacy runtime payloads on the backend and frontend boundary: `SCAN_QR_CODE` becomes `connecting`, raw `whatsapp-api` becomes `legacy-runtime`, and QR/viewer/browser flags are stripped from the public surface.
- The backend route `GET /whatsapp-api/session/qr` now returns a real `410 Gone` Meta-first sentinel instead of serving QR snapshots from legacy WAHA sessions.
- Legacy backend endpoints that still belonged to the browser runtime (`session/link`, `session/claim`, `session/view`, `session/action`, and the related viewer control routes) now also return real `410 Gone` Meta-first responses instead of `200` payloads with soft errors.
- The smoke test now checks the whole legacy WAHA/browser matrix for `410 Gone`, not just `/session/qr`, so preview/prod will fail fast if any of those dead routes regress.
- Watchdog operational logs no longer mention WAHA by name when referring to legacy runtime adoption/cleanup and unconfirmed reconnect states.
- The Messenger tab in Marketing is no longer blocked by an “Em breve” overlay and now reflects the real connection state.
- Settings now show a real operator alert card backed by `/health/system`, with actionable notices for DB, Redis, Meta transport, worker, storage, config, Stripe, and AI providers.
- The "Apps e integrações" cards in Settings now reflect live WhatsApp, Meta, and billing state instead of hardcoded green badges.
- Marketing tabs now derive channel availability from a single source of truth; Email, Instagram, Facebook, and WhatsApp are live surfaces, and only TikTok remains intentionally blocked with an explicit overlay.
- The WhatsApp overview page and legacy side console no longer print raw provider tokens or QR-first copy; they describe the runtime as Meta infrastructure / legacy runtime in product language.
- Kloel tool descriptions and guest prompts now describe WhatsApp onboarding as the official Meta flow instead of QR onboarding.
- Anonymous sessions now create a `Workspace Temporario` with agent name `Visitante` instead of the old `Guest Workspace`/`Guest` pair, and the watchdog/catchup/prompt heuristics accept both labels so existing rows keep behaving correctly while the product stops exposing the old placeholder identity.
- The unified-agent prompt guardrails now explicitly ban both `Guest Workspace` and `Workspace Temporario` from being echoed as the company identity.
- Public visitor chat now uses the neutral `visitor_*` session prefix and `kloel_visitor_session` storage key, with automatic migration from the old `kloel_guest_session` browser key.
- Frontend public chat surfaces now call `/chat/visitor` and `/chat/visitor/sync`; the backend keeps `/chat/guest*` as a compatibility alias during the migration window.
- The public visitor-chat controller/service exports were renamed internally to `VisitorChat*`, so logs/DI no longer reinforce the old guest naming while the compatibility URLs remain unchanged.
- `FloatingChat` now persists a real `kloel:floating-chat:visitor-session`, migrates the old guest key automatically, and creates a fresh visitor session before the first outbound message.
- `HomeScreen` now persists a real `kloel:home-chat:visitor-session`, migrates the old guest key, sends `X-Session-Id` on public `/chat/visitor` requests, stores session ids returned by SSE payloads, and rotates to a fresh visitor session on “Nova conversa”.
- `KloelChatBubble` now uses `/chat/visitor/sync` instead of treating the streaming endpoint as JSON, persists its own checkout-scoped `visitor-session`, and updates that session from the backend response payload.
- `VISITOR_CHAT_ENABLED` is now the canonical env flag for public visitor chat; diagnostics expose `deploy.visitorChatEnabled`, `deploy.guestChatEnabled` remains only as a backward-compatible alias, and `GUEST_CHAT_ENABLED` is now just a migration fallback.

## Environment variables Daniel needs to set

See `docs/deployment/env-vars.md` for the full matrix. The minimum production set to unblock review and smoke testing is:

- Railway backend:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `JWT_SECRET`
  - `NEXTAUTH_SECRET`
  - `FRONTEND_URL`
  - `GOOGLE_CLIENT_ID`
  - `VISITOR_CHAT_ENABLED=true`
  - `META_APP_ID`
  - `META_APP_SECRET`
  - `META_VERIFY_TOKEN`
  - `META_WEBHOOK_VERIFY_TOKEN`
  - `META_EMBEDDED_SIGNUP_CONFIG_ID`
  - `META_SYSTEM_USER_TOKEN`
  - `META_BUSINESS_ID`
  - `RESEND_API_KEY`
  - optional SMTP fallback: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- Vercel frontend:
  - `BACKEND_URL`
  - `NEXT_PUBLIC_SITE_URL`
  - `NEXT_PUBLIC_AUTH_URL`
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_CHECKOUT_DOMAIN`
  - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
  - `NEXT_PUBLIC_META_APP_ID`
  - `NEXT_PUBLIC_APPLE_CLIENT_ID`
  - `NEXT_PUBLIC_META_GRAPH_API_VERSION`
  - `NEXT_PUBLIC_LEGAL_LAST_UPDATED`
  - `NEXT_PUBLIC_LEGAL_COMPANY`
  - `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL=false`

## Manual actions Daniel must perform, in order

1. Configure the backend and frontend environment variables described above.
2. Verify `kloel.com` in Google Search Console.
3. Verify `kloel.com` in Meta Business Manager / Brand Safety.
4. Set the Meta App Dashboard URLs:
   - Privacy Policy URL: `https://kloel.com/privacy`
   - Terms of Service URL: `https://kloel.com/terms`
   - Data Deletion Callback URL: `https://app.kloel.com/api/auth/facebook/data-deletion`
   - Deauthorize Callback URL: `https://app.kloel.com/api/auth/facebook/deauthorize`
   - Webhook URL: `https://app.kloel.com/api/webhooks/meta`
5. Configure the Meta webhook verification token to match `META_WEBHOOK_VERIFY_TOKEN`.
6. Configure Google OAuth consent screen links to the live privacy and terms pages.
7. Review and submit:
   - `docs/compliance/google-oauth-submission.md`
   - `docs/compliance/meta-app-review-submission.md`
8. After Google approves the sensitive scopes, flip `KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL=true` in the backend and `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL=true` in Vercel.

## Current caveats

- Root `package.json` is governance-protected, so a root-level `npm run smoke-test:prod` script cannot be added without explicit human approval. The smoke test is therefore attached to the `e2e` package instead.
- Smoke command available now: `cd e2e && npm run smoke-test:prod`
- A valid Google-signed RISC token cannot be generated locally, so production smoke validation can only assert the negative-path rejection unless tested against a live Google callback.
- The repo still contains internal WAHA-era code paths in backend runtime modules. The user-facing/public path is now Meta-first, but a full codebase purge of WAHA internals remains a separate cleanup pass.
- `.env.example` and `backend/.env.example` now default `WHATSAPP_PROVIDER_DEFAULT=meta-cloud` and expose `META_EMBEDDED_SIGNUP_CONFIG_ID` as the canonical Embedded Signup env. Legacy aliases remain documented only as migration fallbacks.

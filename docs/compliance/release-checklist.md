# Compliance Release Checklist

Last updated: 2026-04-19

## Legal surfaces

- `https://kloel.com/privacy` returns `200`.
- `https://kloel.com/privacy/en` returns `200`.
- `https://kloel.com/terms` returns `200`.
- `https://kloel.com/terms/en` returns `200`.
- `https://kloel.com/data-deletion` returns `200`.
- `https://kloel.com/data-deletion/en` returns `200`.
- Privacy Policy includes Google API Services User Data Policy and Limited Use language.
- Privacy Policy includes Meta permissions and purposes.

## Authentication and callbacks

- Google login works with `openid`, `email`, `profile`.
- Facebook login works from the Kloel auth surface.
- Magic-link request and consume flows work end to end.
- Frontend auth proxies fail with explicit `503` responses when `BACKEND_URL` is absent, and shared-auth cookie hydration accepts both `access_token` and `accessToken` payload shapes across register/login/social/magic-link/Apple callback flows.
- `Settings > Conta` exposes data export and self-service account deletion.
- `Settings > Conta` supports authenticated password change, sends a real password reset email, lists active refresh-token sessions, signs out the current device, revokes individual remote sessions, and can revoke all other devices in one action.
- `ContaView` no longer shows a fake “Sessões ativas” placeholder and uses the same live session inventory and canonical sign-out path as the settings surface.
- `/auth/sessions`, `/auth/sessions/revoke-current`, `/auth/sessions/revoke-others`, and `/auth/sessions/revoke` are reachable behind authenticated access only and return the frozen contract shape.
- Refresh tokens are stored hashed at rest and legacy plaintext rows still refresh successfully during rotation.
- Password reset, magic-link, OAuth link-confirmation, and email-verification tokens are stored hashed at rest.
- Facebook data deletion callback returns a status URL and confirmation code.
- Facebook data deletion actually completes the linked Kloel account purge when the provider identity matches an existing user.
- Facebook deauthorize callback returns `200`.
- Facebook deauthorize removes linked `SocialAccount` rows and only clears the primary login identity when Facebook was the active auth provider.
- Google RISC endpoint is deployed and reachable.
- Google RISC resolves Google identities stored in linked `SocialAccount` rows, not only the legacy primary-provider columns.
- Google RISC `account-purged` silently purges the linked user without creating a fake self-service deletion record or sending a confirmation email.
- User data export includes social identities, compliance state, prior deletion requests, and sanitized session metadata.

## Meta platform readiness

- `https://app.kloel.com/api/webhooks/meta` verifies `hub.challenge`.
- Meta webhook signature validation is enabled with `META_APP_SECRET`.
- Unsigned Meta webhook POST requests are rejected.
- Data deletion callback URL and deauthorize callback URL are configured in Meta.
- Domain verification is completed in Meta Business Manager.
- `/meta/auth/url` returns a real Embedded Signup URL in configured environments and fails with `503` when the Meta app/config envs are missing.
- Meta Ads, Instagram, and Messenger surfaces no longer require Graph access tokens from the browser; the backend resolves them from the encrypted workspace connection.
- Public WAHA QR/browser routes now return `410 Gone` and no user-facing screen still instructs QR onboarding.
- The shared WhatsApp session hook no longer polls the deprecated QR endpoint while Meta auth is pending.
- WhatsApp runtime and marketing screens surface live `quality_rating`, code verification, and name status for the connected Meta number.
- WhatsApp runtime status and fallback copy no longer instruct operators to use WAHA or scan QR codes.
- Frontend viewer/browser fallbacks identify as `meta-cloud` rather than `whatsapp-api`, so disabled legacy surfaces no longer masquerade as an active WAHA runtime.
- Deprecated QR helpers return local Meta-first sentinels and do not call `/api/whatsapp-api/session/qr` anymore.
- Deprecated App Router routes for legacy browser control (`session/view`, `session/link`, `session/claim`, `session/action`, `session/takeover`, `session/resume-agent`, `session/pause-agent`, `session/stream-token`, `session/action-turn`) all return local `410 Gone` sentinels and are covered by route tests.
- Legacy QR panes only render diagnostic/deprecation copy and no longer instruct operators to scan a QR code.
- The diagnostic pane and related copy no longer use QR naming for the supported Meta path.
- The shared WhatsApp session hook sanitizes any legacy runtime payload before it reaches UI state, so QR/viewer/browser fields cannot leak back into React even through an unsanitized response.
- The public `POST /whatsapp-api/session/start` surface now ignores stale QR fields entirely and behaves as OAuth/message-only at the browser boundary.
- Legacy-runtime workspaces now get an official Meta Embedded Signup URL back from `POST /whatsapp-api/session/start`, so the supported connection path remains one click away even before workspace settings are cleaned up.
- If Embedded Signup is not configured on the server, that same legacy start path now fails explicitly with `meta_embedded_signup_not_configured` instead of leaving the browser in a dead pending state.
- `Settings > Conta` writes `meta-cloud` back to the workspace even when legacy provider rows still exist in `providerSettings`.
- The shared WhatsApp session hook drops `qrCode` snapshots from the runtime status payload.
- Marketing connect status uses `legacy-runtime` instead of exposing the raw `whatsapp-api` token to the product surface.
- Workspace/account/settings payloads also use `legacy-runtime` instead of exposing the raw `whatsapp-api` token back to the browser.
- `/whatsapp-api/session/status` returns the sanitized public contract for legacy runtimes: `connecting` instead of `SCAN_QR_CODE`, `legacy-runtime` instead of `whatsapp-api`, and no QR/viewer/browser flags.
- `GET /whatsapp-api/session/qr` now returns a real `410 Gone` legacy-disabled sentinel on the backend too, not just in the frontend proxy.
- Legacy browser-runtime endpoints such as `session/link`, `session/claim`, `session/view`, and `session/action` now return real `410 Gone` responses on the backend, so the proxy/browser no longer receives soft `200` errors for unsupported flows.
- Legacy client helpers for session claim/manual link/viewer control now return local Meta-first sentinels without touching the dead routes.
- Auth bootstrap/login hydration no longer tries to claim a guest WhatsApp session after login, and the stale guest-claim storage path was removed because that legacy runtime upgrade path is gone.
- Worker WhatsApp routing honors persisted workspace provider overrides before env defaults, matching the backend precedence contract.
- Settings renders a real operator alert panel from `/health/system` instead of an empty placeholder card.
- Settings "Apps e integrações" reflects live WhatsApp, Meta, and billing state.
- Marketing only shows an "Em breve" overlay for TikTok; Email, Instagram, Facebook, and WhatsApp use live channel surfaces.
- The smoke test asserts the whole deprecated WAHA/browser route matrix returns `410 Gone`, so preview/prod catches regressions beyond `/session/qr`.
- Kloel tool descriptions and guest prompts no longer tell operators or visitors to connect WhatsApp via QR code.
- Anonymous sessions now use `Workspace Temporario` with agent name `Visitante` instead of the old `Guest Workspace`/`Guest` identity, while detection heuristics still accept the old label for legacy rows.
- Unified-agent prompt guardrails explicitly block both `Guest Workspace` and `Workspace Temporario` from leaking as the company identity in generated copy.
- Public visitor chat uses the neutral `visitor_*` session prefix and migrates old `kloel_guest_session` browser storage to `kloel_visitor_session`.
- Public chat callers now use `/chat/visitor`, while the backend still accepts `/chat/guest*` as a compatibility alias during rollout.
- Visitor chat runtime/services now log and resolve through `VisitorChat*` internals instead of `GuestChat*`, while keeping the compatibility URL aliases intact.
- `FloatingChat` persists `kloel:floating-chat:visitor-session`, migrates the old guest key automatically, and creates a fresh visitor session before the first request.
- `HomeScreen` persists `kloel:home-chat:visitor-session`, reuses it on `/chat/visitor` requests, stores session ids returned by SSE payloads, and rotates to a fresh visitor session on “Nova conversa”.
- `KloelChatBubble` uses `/chat/visitor/sync`, persists a checkout-scoped visitor session, and updates that session from the backend reply payload instead of parsing the streaming endpoint as JSON.
- `VISITOR_CHAT_ENABLED` is now the canonical env flag for public visitor chat, and `/diag/full` exposes `deploy.visitorChatEnabled` while keeping `deploy.guestChatEnabled` only as a compatibility alias.

## Google readiness

- `kloel.com` is verified in Google Search Console.
- OAuth consent screen links point to live privacy and terms pages.
- Google project check-up warnings are green.
- Sensitive People API scopes remain disabled behind `KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL` and `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL` until approval.
- Authenticated checkout sessions can reach `/api/user/google-profile-extended` through the frontend proxy and reuse the same Google incremental-consent token to hydrate phone/address without reopening the public lead path first.
- The checkout social identity lane exposes Google, Facebook, and Apple without “coming soon” placeholders, and Apple returns the buyer to the same checkout after callback instead of dumping them into the app surface.
- Public checkout payloads do not expose Meta / Facebook pixel access tokens to the browser.
- Operator checkout pixel APIs expose masked token previews only, while persisted Meta pixel credentials stay encrypted at rest.

## Environment and secrets

- Railway backend envs set.
- Vercel frontend envs set.
- No secrets committed to source control.
- Meta connection tokens and checkout pixel tokens are encrypted at rest before persistence.
- Workspace calendar credentials written via settings are encrypted at rest and decrypted only inside the runtime calendar integration path.
- Workspace/account/settings endpoints sanitize `providerSettings` recursively before responding, so nested API keys, refresh tokens, client secrets, and Graph tokens are never exposed to the browser.
- Public API keys are stored hashed at rest, list/delete endpoints never echo the stored secret, and legacy plaintext rows migrate on first successful validation.
- Outbound webhook subscription secrets are encrypted at rest, decrypted only inside the dispatcher runtime, and list/idempotent create paths never echo the raw secret.
- Push-device tokens are stored hashed at rest with encrypted ciphertext for runtime delivery, register/unregister keep legacy plaintext fallback during migration, and registration returns only the device identifier.
- Collaborator invite tokens are stored hashed at rest and collaborator invite responses do not expose raw invite tokens.
- Data-deletion confirmation codes are stored hashed at rest, while status-page lookups still support legacy plaintext rows during migration.
- Team invitation tokens are stored hashed at rest and team invite responses do not expose raw tokens.
- Device-token logs do not print token fragments.
- Production tokens rotated after any manual sharing event.

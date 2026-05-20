# Kloel handoff

## What this branch leaves working

### Auth and account safety

- Google sign-in remains active with RISC-ready compliance support already wired
  in the backend.
- Facebook user sign-in is now available in the frontend auth screen through the
  Meta JavaScript SDK and backend token exchange.
- OAuth collisions by email no longer merge providers silently; the backend now
  requires the user to re-authenticate through an existing trusted method
  before linking another social provider.
- Magic-link login is wired end-to-end with frontend proxy routes and a public
  `/magic-link` verifier page.
- Apple sign-in callback routing is now aligned to a real App Router endpoint
  that proxies to `/auth/oauth/apple` and sets shared auth cookies.

### Compliance and legal surface

- Public legal pages exist in PT-BR and English:
  - `/privacy`
  - `/terms`
  - `/data-deletion`
  - `/privacy/en`
  - `/terms/en`
  - `/data-deletion/en`
- Facebook Data Deletion and Deauthorize callbacks exist in the backend.
- Google RISC endpoint exists in the backend with event persistence.
- Meta webhook verification now prefers `META_VERIFY_TOKEN` and no longer ships
  with a hardcoded fallback token.
- Public deletion-status page exists with backend status lookup proxy.
- `robots.ts` and `sitemap.ts` include the legal routes.

### Checkout social identity

- Checkout social capture supports Google and Facebook.
- Incremental Google People API prefill is already implemented and is controlled
  by `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL` (with backward-compatible
  support for the legacy `NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED` alias).
- The checkout identity UI now exposes real Facebook login instead of a dead
  placeholder.
- Stripe checkout now exposes the Express Checkout wallet surface above the
  card form when Apple Pay or Google Pay is available in the buyer context.

### Meta channel posture and legacy WAHA fallback

- New Meta connection writes encrypt persisted access tokens at rest and reads
  legacy plaintext rows through backward-compatible decryption helpers.
- Default WhatsApp provider resolution now stays on `meta-cloud` unless a
  legacy WAHA provider is explicitly configured.

### Delivery artifacts

- `docs/compliance/google-oauth-submission.md`
- `docs/compliance/meta-app-review-submission.md`
- `docs/compliance/domain-and-webhook-verification.md`
- `docs/compliance/release-checklist.md`
- `docs/deployment/env-vars.md`
- `scripts/smoke-test-prod.ts`

## Validation status

This document previously tracked verification commands from earlier branch work.
No fresh validation commands were executed in this session, so treat the current
source of truth as:

- the code changes listed in this handoff
- `docs/compliance/release-checklist.md`
- a fresh run of `scripts/smoke-test-prod.ts` after deploy

## Manual actions Daniel still needs to execute

1. Configure the new env vars in Railway and Vercel using
   `docs/deployment/env-vars.md`.
2. In the Vercel project `kloel-admin`, set `NEXT_PUBLIC_ADMIN_API_URL` before
   the next production build. The admin app build fails without it.
3. Verify `kloel.com` in Google Search Console.
4. Verify `kloel.com` in Meta Business Manager.
5. Register the Meta webhook public URL and the `META_VERIFY_TOKEN`.
6. Register the Google RISC endpoint public URL.
7. Run `npm --prefix frontend exec -- tsx scripts/smoke-test-prod.ts` against
   the deployed environment.
8. Submit Google OAuth Verification using
   `docs/compliance/google-oauth-submission.md`.
9. Submit Meta App Review using `docs/compliance/meta-app-review-submission.md`.
10. Only after Google approves the sensitive scopes, decide whether to turn on
    `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL=true`.

## Important governance note

The repository forbids autonomous edits to protected governance files, including
`package.json`.

Because of that:

- the smoke test was added as `scripts/smoke-test-prod.ts`
- no new root alias like `npm run smoke-test:prod` was wired automatically

If you want that alias, add it manually in `package.json` after reviewing the
governance boundary.

## Remaining caveats

- The repo worktree is not globally clean. There are broad unrelated
  modifications, including protected governance surfaces, that were already
  present and were not touched here.
- Public callback URLs documented as `https://app.kloel.com/api/...` assume the
  production ingress exposes the backend under `/api`. If your ingress differs,
  keep the controller paths and change only the external base URL.
- The `kloel-admin` Vercel failure observed during this session is
  configuration-only. Local validation passed for `typecheck`, `test`, and
  `build` once `NEXT_PUBLIC_ADMIN_API_URL` was set.

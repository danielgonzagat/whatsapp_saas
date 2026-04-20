# Kloel release and review checklist

Use this list immediately before Google OAuth Verification and Meta App Review.

## Domains and legal URLs

- `kloel.com` verified in Google Search Console.
- `kloel.com` verified in Meta Business Manager.
- `https://kloel.com/privacy` returns `200`.
- `https://kloel.com/terms` returns `200`.
- `https://kloel.com/data-deletion` returns `200`.
- English mirrors also return `200`.

## Google OAuth verification readiness

- OAuth consent screen home page points to `https://kloel.com`.
- Privacy policy URL points to `https://kloel.com/privacy`.
- Terms URL points to `https://kloel.com/terms`.
- The scopes enabled in Google Cloud exactly match the scopes documented in
  `docs/compliance/google-oauth-submission.md` and the privacy policy.
- `state` is present in the Google authorization flow.
- Public RISC URL is reachable at
  `https://app.kloel.com/api/auth/google/risc-events` or the equivalent public
  ingress URL you actually use.
- RISC registration is completed for:
  - `sessions-revoked`
  - `tokens-revoked`
  - `account-disabled`
  - `account-purged`
- Sensitive People API scopes remain disabled until approval unless you are
  explicitly submitting them now.

## Meta App Review readiness

- Privacy Policy URL is set in the Meta app dashboard.
- Terms of Service URL is set in the Meta app dashboard.
- Data Deletion Callback URL is set to
  `https://app.kloel.com/api/auth/facebook/data-deletion` or your equivalent
  ingress URL.
- Deauthorize Callback URL is set to
  `https://app.kloel.com/api/auth/facebook/deauthorize` or your equivalent
  ingress URL.
- Webhook URL is set to `https://app.kloel.com/api/webhooks/meta` or your
  equivalent ingress URL.
- `META_VERIFY_TOKEN` configured in Railway matches the token entered in the
  Meta dashboard.
- JS SDK allowed domains include:
  - `kloel.com`
  - `www.kloel.com`
  - `auth.kloel.com`
  - `app.kloel.com`
  - `pay.kloel.com`
- Review credentials are prepared in a dedicated test workspace and are not
  stored in the repository.

## Auth and account safety

- Login page renders Google, Facebook, Apple, and magic-link options.
- Google login succeeds for a valid reviewer account.
- Facebook login succeeds for a valid reviewer account.
- Existing email collisions do not silently merge providers.
- Provider tokens are stored encrypted at rest in backend persistence.
- Magic-link request and verify paths are working in production.

## Meta channel operations

- Meta OAuth / Embedded Signup callback succeeds end-to-end.
- A connected workspace shows WhatsApp / Instagram / Facebook identifiers after
  authorization.
- Meta webhook GET verification challenge succeeds.
- Meta webhook POST accepts valid signatures and rejects invalid signatures.
- Default provider selection is `meta-cloud`; WAHA is only used when explicitly
  configured for legacy support.

## Checkout readiness

- Public checkout HTML contains native autofill attributes:
  - `cc-name`
  - `cc-number`
  - `cc-exp`
  - `cc-csc`
  - `email`
  - `tel`
  - `postal-code`
  - `address-line1`
  - `address-level2`
  - `address-level1`
- Card fields render inside a real `<form>`.
- Stripe card flow returns a client secret and renders the Stripe payment
  surface.
- Wallet surface appears when Apple Pay or Google Pay is available.
- Manual card entry still works when wallets are unavailable.

## Operational checks

- Railway env vars are aligned with `docs/deployment/env-vars.md`.
- Vercel env vars are aligned with `docs/deployment/env-vars.md`.
- `docs/KLOEL-HANDOFF.md` is still accurate after the latest deploy.
- `scripts/smoke-test-prod.ts` passes against the preview or production target.

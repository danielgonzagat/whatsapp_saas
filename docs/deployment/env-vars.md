# Kloel production environment variables

`package.json` is governance-protected, so this document is the source of truth
for the new production-readiness surface added in this branch.

## Shared URL surface

| Variable                      | Where                            | Required    | Example                       | Purpose                                                   |
| ----------------------------- | -------------------------------- | ----------- | ----------------------------- | --------------------------------------------------------- |
| `FRONTEND_URL`                | Railway backend, Railway worker  | Yes         | `https://app.kloel.com`       | Public frontend base used in backend redirects and emails |
| `BACKEND_URL`                 | Vercel frontend                  | Yes         | `https://app.kloel.com/api`   | Server-side proxy target for Next API routes              |
| `NEXT_PUBLIC_API_URL`         | Vercel frontend                  | Yes         | `https://app.kloel.com/api`   | Browser-side API base                                     |
| `NEXT_PUBLIC_ADMIN_API_URL`   | Vercel `kloel-admin`             | Yes         | `https://app.kloel.com/admin` | Browser API base for the admin control plane              |
| `NEXT_PUBLIC_SITE_URL`        | Vercel frontend, Railway backend | Yes         | `https://kloel.com`           | Canonical marketing/legal base URL                        |
| `NEXT_PUBLIC_AUTH_URL`        | Vercel frontend                  | Recommended | `https://auth.kloel.com`      | Auth subdomain URL builder                                |
| `NEXT_PUBLIC_APP_URL`         | Vercel frontend                  | Recommended | `https://app.kloel.com`       | App subdomain URL builder                                 |
| `NEXT_PUBLIC_CHECKOUT_DOMAIN` | Vercel frontend                  | Recommended | `https://pay.kloel.com`       | Checkout subdomain URL builder                            |

## Authentication and encryption

| Variable           | Where                            | Required | Example / generation      | Purpose                                            |
| ------------------ | -------------------------------- | -------- | ------------------------- | -------------------------------------------------- |
| `JWT_SECRET`       | Railway backend                  | Yes      | `openssl rand -base64 48` | Signs Kloel access JWTs                            |
| `NEXTAUTH_SECRET`  | Vercel frontend                  | Yes      | `openssl rand -base64 48` | Frontend auth session secret                       |
| `ENCRYPTION_KEY`   | Railway backend                  | Yes      | `openssl rand -hex 32`    | Encrypts stored provider access and refresh tokens |
| `INTERNAL_API_KEY` | Railway backend, Vercel frontend | Yes      | `openssl rand -hex 32`    | Secures internal proxy/API paths                   |

## Google OAuth and Cross-Account Protection

| Variable                                   | Where           | Required | Example                          | Purpose                                                  |
| ------------------------------------------ | --------------- | -------- | -------------------------------- | -------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`                         | Railway backend | Yes      | `123.apps.googleusercontent.com` | Validates Google ID tokens and RISC audience             |
| `GOOGLE_ALLOWED_CLIENT_IDS`                | Railway backend | Optional | `prod,preview,local` CSV         | Allows multiple web client IDs                           |
| `GOOGLE_CLIENT_SECRET`                     | Railway backend | Optional | Google secret                    | Needed for code flows beyond GIS                         |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`             | Vercel frontend | Yes      | `123.apps.googleusercontent.com` | Browser Google Identity Services client id               |
| `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL` | Vercel frontend | Optional | `false` | Enables the incremental People API checkout prefill flow |
| `NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED` | Vercel frontend | Legacy alias | `false` | Backward-compatible alias accepted by the checkout runtime |

## Apple sign-in

| Variable                      | Where           | Required                    | Example             | Purpose                                         |
| ----------------------------- | --------------- | --------------------------- | ------------------- | ----------------------------------------------- |
| `APPLE_CLIENT_ID`             | Railway backend | Optional until Apple launch | `com.kloel.app`     | Apple Sign-In server client id                  |
| `APPLE_CLIENT_SECRET`         | Railway backend | Optional until Apple launch | Apple generated JWT | Apple Sign-In server secret                     |
| `NEXT_PUBLIC_APPLE_CLIENT_ID` | Vercel frontend | Optional until Apple launch | `com.kloel.app`     | Browser redirect construction for Apple Sign-In |

## Meta platform and official channels

| Variable                             | Where                            | Required          | Example                 | Purpose                                                        |
| ------------------------------------ | -------------------------------- | ----------------- | ----------------------- | -------------------------------------------------------------- |
| `META_APP_ID`                        | Railway backend, Vercel frontend | Yes               | `1234567890`            | Meta app id for JS SDK and server OAuth                        |
| `META_APP_SECRET`                    | Railway backend                  | Yes               | Meta app secret         | Validates Facebook signed requests and Meta webhook signatures |
| `META_CONFIG_ID`                     | Railway backend                  | Recommended       | Meta config id          | Enables Embedded Signup configuration binding                  |
| `META_GRAPH_API_VERSION`             | Railway backend, Vercel frontend | Recommended       | `v21.0`                 | Locks Meta Graph version used by SDK/API calls                 |
| `NEXT_PUBLIC_META_APP_ID`            | Vercel frontend                  | Yes               | `1234567890`            | Initializes the Facebook JS SDK                                |
| `NEXT_PUBLIC_META_GRAPH_API_VERSION` | Vercel frontend                  | Recommended       | `v21.0`                 | Keeps JS SDK version aligned with backend                      |
| `META_VERIFY_TOKEN`                  | Railway backend                  | Yes               | `openssl rand -hex 24`  | Verifies Meta webhook GET subscription challenge               |
| `META_WEBHOOK_VERIFY_TOKEN`          | Railway backend                  | Legacy alias      | `openssl rand -hex 24`  | Backward-compatible alias accepted by the backend              |
| `META_ACCESS_TOKEN`                  | Railway backend                  | Optional fallback | long-lived system token | Fallback token for official WhatsApp operations                |
| `META_PHONE_NUMBER_ID`               | Railway backend                  | Optional fallback | `123456789`             | Fallback WhatsApp Cloud phone number id                        |
| `META_WABA_ID`                       | Railway backend                  | Optional fallback | `987654321`             | Fallback WhatsApp Business Account id                          |

## Legal / compliance content

| Variable                         | Where           | Required    | Example                 | Purpose                                     |
| -------------------------------- | --------------- | ----------- | ----------------------- | ------------------------------------------- |
| `LEGAL_DPO_EMAIL`                | Railway backend | Recommended | `privacy@kloel.com`     | Compliance contact reference                |
| `LEGAL_SUPPORT_EMAIL`            | Railway backend | Recommended | `ajuda@kloel.com`       | Customer support / deletion request channel |
| `NEXT_PUBLIC_LEGAL_LAST_UPDATED` | Vercel frontend | Yes         | `2026-04-19`            | Drives the legal page “last updated” date   |
| `NEXT_PUBLIC_LEGAL_COMPANY`      | Vercel frontend | Yes         | `Kloel Tecnologia LTDA` | Drives legal controller/company display     |

## Email and notifications

| Variable                 | Where           | Required    | Example                     | Purpose                                           |
| ------------------------ | --------------- | ----------- | --------------------------- | ------------------------------------------------- |
| `RESEND_API_KEY`         | Railway backend | Recommended | `re_...`                    | Sends magic link and deletion confirmation emails |
| `EMAIL_FROM`             | Railway backend | Recommended | `KLOEL <noreply@kloel.com>` | Sender identity                                   |
| `SENTRY_DSN`             | Railway backend | Optional    | Sentry DSN                  | Backend error reporting                           |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel frontend | Optional    | Sentry DSN                  | Frontend error reporting                          |

## Data plane

| Variable       | Where                           | Required    | Example      | Purpose                         |
| -------------- | ------------------------------- | ----------- | ------------ | ------------------------------- |
| `DATABASE_URL` | Railway backend                 | Yes         | Postgres URL | Primary database                |
| `REDIS_URL`    | Railway backend, Railway worker | Recommended | Redis URL    | Shared rate limiting and queues |

## Smoke test variables

These are not application runtime variables. They are only consumed by
`scripts/smoke-test-prod.ts`.

| Variable                      | Required    | Example                          | Purpose                                                                |
| ----------------------------- | ----------- | -------------------------------- | ---------------------------------------------------------------------- |
| `SMOKE_SITE_URL`              | Yes         | `https://kloel.com`              | Public legal-pages base                                                |
| `SMOKE_AUTH_URL`              | Recommended | `https://auth.kloel.com`         | Authentication surface base for login-page smoke checks                |
| `SMOKE_APP_URL`               | Recommended | `https://app.kloel.com`          | Frontend app base for proxied auth/compliance routes                   |
| `SMOKE_API_URL`               | Recommended | `https://app.kloel.com/api`      | Direct backend public base                                             |
| `SMOKE_META_VERIFY_TOKEN`     | Optional    | random secret                    | Verifies Meta webhook GET challenge                                    |
| `SMOKE_META_APP_SECRET`       | Optional    | Meta app secret                  | Signs webhook and Facebook privacy callback payloads                   |
| `SMOKE_FACEBOOK_TEST_USER_ID` | Optional    | app-scoped user id               | Generates a valid signed request for deletion/deauthorize smoke checks |
| `SMOKE_GOOGLE_RISC_JWT`       | Optional    | captured valid SET               | Allows a full valid RISC callback replay                               |
| `SMOKE_CHECKOUT_URL`          | Optional    | `https://pay.kloel.com/oferta-x` | Audits checkout autofill surface                                       |
| `SMOKE_MAGIC_LINK_EMAIL`      | Optional    | `qa@kloel.com`                   | Triggers magic-link request validation                                 |

## Recommended manual rollout order

1. Set backend secrets in Railway.
2. Set frontend public vars in Vercel.
3. Redeploy backend.
4. Redeploy frontend.
5. Run the smoke test against the deployed URLs.
6. Configure Google Search Console and Meta domain verification.
7. Register RISC and Meta webhook subscriptions.

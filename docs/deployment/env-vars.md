# Environment Variables

Last updated: 2026-04-18

| Variable | Railway backend | Railway worker | Vercel frontend | Example / generation | Required | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | yes | yes | no | `postgresql://...` | yes | Primary application database |
| `REDIS_URL` | yes | yes | no | `redis://...` | yes | Rate limiting, queues, session helpers |
| `JWT_SECRET` | yes | yes | no | `openssl rand -hex 32` | yes | Backend JWT signing |
| `NEXTAUTH_SECRET` | yes | no | yes | `openssl rand -hex 32` | yes | Shared auth secret surface |
| `NEXTAUTH_URL` | yes | no | yes | `https://auth.kloel.com` | yes | Auth base URL |
| `FRONTEND_URL` | yes | no | no | `https://kloel.com` | yes | Backend links and emails |
| `BACKEND_URL` | no | no | yes | `https://api.kloel.com` or backend public URL | yes | Frontend server-side auth proxy target |
| `NEXT_PUBLIC_SITE_URL` | no | no | yes | `https://kloel.com` | yes | Marketing/legal canonical base |
| `NEXT_PUBLIC_AUTH_URL` | no | no | yes | `https://auth.kloel.com` | yes | Auth subdomain resolution |
| `NEXT_PUBLIC_APP_URL` | no | no | yes | `https://app.kloel.com` | yes | App subdomain resolution |
| `NEXT_PUBLIC_CHECKOUT_DOMAIN` | no | no | yes | `https://pay.kloel.com` | yes | Checkout subdomain resolution |
| `GOOGLE_CLIENT_ID` | yes | yes | no | Google OAuth client ID | yes | Google auth validation and RISC audience |
| `GOOGLE_CLIENT_SECRET` | yes | no | no | Google OAuth client secret | recommended | Future server-side OAuth flows |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | no | no | yes | same as `GOOGLE_CLIENT_ID` | yes | Google Identity Services button |
| `NEXT_PUBLIC_APPLE_CLIENT_ID` | no | no | yes | `com.kloel.web` | recommended | Apple Sign-In on auth and checkout surfaces |
| `VISITOR_CHAT_ENABLED` | yes | no | no | `true` | recommended | Canonical flag for public visitor chat availability |
| `WHATSAPP_PROVIDER_DEFAULT` | yes | yes | no | `meta-cloud` | recommended | Canonical provider routing; keep production on Meta Cloud |
| `KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL` | yes | yes | no | `false` | yes | Backend/worker flag for sensitive People API prefill flows |
| `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL` | no | no | yes | `false` | yes | Frontend flag that unlocks checkout People API hydration after approval |
| `META_APP_ID` | yes | yes | no | Meta app id | yes | Backend Meta integrations |
| `META_APP_SECRET` | yes | yes | no | Meta app secret | yes | Signature verification and SDK validation |
| `NEXT_PUBLIC_META_APP_ID` | no | no | yes | same Meta app id | yes | Facebook JS SDK / login button |
| `NEXT_PUBLIC_META_GRAPH_API_VERSION` | no | no | yes | `v21.0` | recommended | Frontend Facebook SDK version pin |
| `NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION` | no | no | yes | token from Meta Brand Safety | optional | Public meta-tag domain verification |
| `META_VERIFY_TOKEN` | yes | yes | no | `openssl rand -hex 32` | yes | Legacy/compat verify token alias |
| `META_WEBHOOK_VERIFY_TOKEN` | yes | yes | no | same as `META_VERIFY_TOKEN` | yes | Public `/webhooks/meta` verification token |
| `META_SYSTEM_USER_TOKEN` | yes | yes | no | `EAAG...` | recommended | Meta Graph automation token |
| `META_BUSINESS_ID` | yes | yes | no | business manager id | recommended | Business asset lookup |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | yes | yes | no | config id from Meta dashboard | recommended | Embedded Signup flow |
| `META_PHONE_NUMBER_ID` | yes | yes | no | phone number id | optional | WhatsApp Cloud direct routing |
| `META_WABA_ID` | yes | yes | no | WABA id | optional | WhatsApp Cloud direct routing |
| `RESEND_API_KEY` | yes | yes | no | `re_...` | recommended | Transactional email delivery |
| `SMTP_HOST` | yes | no | no | `smtp.resend.com` | optional fallback | SMTP host when Resend/SendGrid are unavailable |
| `SMTP_PORT` | yes | no | no | `587` or `465` | optional fallback | SMTP port; `465` enables secure transport automatically |
| `SMTP_USER` | yes | no | no | provider username | optional fallback | SMTP auth username |
| `SMTP_PASS` | yes | no | no | provider password | optional fallback | SMTP auth password |
| `EMAIL_FROM` | yes | no | no | `KLOEL <noreply@kloel.com>` | recommended | Sender identity for transactional email |
| `OPENAI_API_KEY` | yes | yes | no | `sk-...` | required for AI flows | CIA / AI processing |
| `STRIPE_SECRET_KEY` | yes | yes | no | `sk_live_...` | optional by market | International payments |
| `STRIPE_PUBLISHABLE_KEY` | no | no | yes | `pk_live_...` | optional by market | Stripe checkout/payment UI |
| `STRIPE_WEBHOOK_SECRET` | yes | yes | no | `whsec_...` | optional by market | Stripe webhook validation |
| `NEXT_PUBLIC_LEGAL_LAST_UPDATED` | no | no | yes | `2026-04-18` | yes | Legal page last-updated label |
| `NEXT_PUBLIC_LEGAL_COMPANY` | no | no | yes | `Kloel Tecnologia LTDA` | yes | Legal page organization label |
| `SENTRY_DSN` | yes | yes | yes | Sentry DSN | recommended | Error monitoring |

## Notes

- `META_WEBHOOK_VERIFY_TOKEN` is the explicit production token read by the public Meta webhook controller. The code also accepts `META_VERIFY_TOKEN` as a fallback alias for compatibility.
- `VISITOR_CHAT_ENABLED` is the canonical public-chat flag. `GUEST_CHAT_ENABLED` is still accepted as a migration fallback, but new environments should set only `VISITOR_CHAT_ENABLED`.
- `WHATSAPP_PROVIDER_DEFAULT` should stay `meta-cloud` in production. Legacy values such as `whatsapp-api` / `waha` remain migration-only fallbacks.
- `RESEND_API_KEY` remains the preferred transactional email provider, but the backend now has a real SMTP fallback through `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`.
- `META_EMBEDDED_SIGNUP_CONFIG_ID` is the primary production env for Embedded Signup. The code still accepts legacy `META_CONFIG_ID` as a fallback alias during migration.
- Keep `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` synchronized.
- Keep `META_APP_ID` and `NEXT_PUBLIC_META_APP_ID` synchronized.
- Keep `KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL` and `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL` aligned.
- Do not enable either People API prefill flag until Google approves the sensitive scopes.

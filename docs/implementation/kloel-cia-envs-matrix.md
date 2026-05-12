# Kloel CIA Environment Matrix

Generated: 2026-05-11

Rule: record variable names and status only; never print secret values.

## Orchestrator Token Availability

| Variable | Scope | Obrigatoriedade | Status | Onda que depende |
|---|---|---|---|---|
| `RAILWAY_TOKEN` | host do orquestrador | required for live Railway env inventory | undefined in current shell | W0/W2/W4/W7 |
| `VERCEL_TOKEN` | host do orquestrador | required for live Vercel env inventory | undefined in current shell | W0/W1/W7 |

Live provider envs could not be inventoried in this pass because these orchestrator tokens are absent. This is registered in External Dependency Register as `EXT-ENV-001`.

## Required / Referenced Variables

| Variavel | Escopo | Obrigatoriedade | Status | Onda que depende |
|---|---|---|---|---|
| `DATABASE_URL` | backend Railway, worker Railway | required | referenced in code; live status unknown | W0+ |
| `REDIS_URL` | backend Railway, worker Railway | required | referenced indirectly by queue/redis code; live status unknown | W6/W7 |
| `META_APP_ID` | backend Railway | required | referenced; live status unknown | W2 |
| `META_APP_SECRET` | backend Railway | required | referenced; live status unknown | W2 |
| `NEXT_PUBLIC_META_APP_ID` | frontend Vercel | required for frontend Meta surfaces | referenced; live status unknown | W2 |
| `NEXT_PUBLIC_META_AUTH_APP_ID` | frontend Vercel | optional/variant | referenced; live status unknown | W2 |
| `META_CONFIG_ID` | backend Railway | required/legacy generic | referenced; live status unknown | W2 |
| `META_BUSINESS_CONFIG_ID` | backend Railway | required for business config variant | referenced; live status unknown | W2 |
| `META_VERIFY_TOKEN` | backend Railway | required for webhook verify | referenced; live status unknown | W2 |
| `META_WEBHOOK_VERIFY_TOKEN` | backend Railway | required/variant | referenced; live status unknown | W2 |
| `META_MARKETING_VERIFY_TOKEN` | backend Railway | required for marketing webhook | referenced; live status unknown | W2 |
| `META_GRAPH_API_VERSION` | backend Railway, frontend Vercel | required | referenced; live status unknown | W2 |
| `BACKEND_PUBLIC_URL` | backend Railway | required for OAuth redirect | referenced; live status unknown | W2/W4 |
| `FRONTEND_URL` | backend Railway | required for redirects | referenced; live status unknown | W1/W2 |
| `NEXT_PUBLIC_APP_URL` | frontend Vercel | required | referenced; live status unknown | W1/W7 |
| `NEXT_PUBLIC_API_URL` | frontend Vercel | required | referenced; live status unknown | W1+ |
| `NEXT_PUBLIC_ADMIN_API_URL` | frontend-admin Vercel | required for `adm.kloel.com` production build/API proxy | locally validated with dummy URL for build; live status unknown | W8/W9 |
| `NEXT_PUBLIC_TIKTOK_CLIENT_KEY` | frontend Vercel | required for TikTok public OAuth | referenced; live status unknown | W3 |
| `GOOGLE_CLIENT_ID` | backend Railway | required for Gmail OAuth | not confirmed in scan output; live status unknown | W4 |
| `GOOGLE_CLIENT_SECRET` | backend Railway | required for Gmail OAuth | not confirmed in scan output; live status unknown | W4 |
| `GOOGLE_PUBSUB_TOPIC` | backend/worker Railway | required for Gmail push | not confirmed in scan output; live status unknown | W4 |
| `MICROSOFT_CLIENT_ID` | backend Railway | required for Microsoft OAuth | not confirmed in scan output; live status unknown | W4 |
| `MICROSOFT_CLIENT_SECRET` | backend Railway | required for Microsoft OAuth | not confirmed in scan output; live status unknown | W4 |
| `MICROSOFT_TENANT_ID` | backend Railway | required for Microsoft OAuth | not confirmed in scan output; live status unknown | W4 |
| `EMAIL_INBOUND_SECRET` | backend/worker Railway | required for email inbound webhook | not confirmed in scan output; live status unknown | W4 |
| `EMAIL_TOKEN_ENCRYPTION_KEY` | backend Railway | required for mailbox token crypto | not confirmed in scan output; live status unknown | W4 |
| `EMAIL_UNSUBSCRIBE_SECRET` | backend/worker Railway | required for email compliance | referenced; live status unknown | W4 EMAIL-9 |
| `ENCRYPTION_KEY` | backend Railway | required for token crypto fallback/crypto | referenced; live status unknown | W2/W4 |
| `META_TOKEN_ENCRYPTION_KEY` | backend Railway | required for Meta token encryption | referenced; live status unknown | W2 |
| `SENTRY_DSN` | backend/frontend/worker | required for observability if configured | not confirmed in scan output; live status unknown | W8 |
| `MERCADOPAGO_ACCESS_TOKEN` | backend Railway | required for MP checkout | referenced; live status unknown | W7 |
| `MERCADOPAGO_WEBHOOK_SECRET` | backend Railway | required for MP webhook | referenced; live status unknown | W7 |
| `PAYMENT_WEBHOOK_SECRET` | backend Railway | required for generic payment webhooks | referenced; live status unknown | W7 |
| `STRIPE_WEBHOOK_SECRET` | backend Railway | required for Stripe payment webhooks and production startup | referenced; live status unknown | W7/W8 |
| `OPENAI_API_KEY` | backend Railway | required for LLM features | referenced; live status unknown | W6/W7 |
| `DEEPSEEK_API_KEY` | host/subagents | required if OpenCode model provider uses it | referenced by environment scan; live status not printed | W0 orchestration |
| `CODACY_API_TOKEN` / `CODACY_PROJECT_TOKEN` | host/CI | required for Codacy sync | referenced; live status unknown | W9 |
| `CODECOV_TOKEN` | CI | required for Codecov | referenced; live status unknown | W9 |

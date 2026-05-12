# Kloel CIA External Dependency Register

Generated: 2026-05-11

| ID | Dependencia | Dono humano | Evidencia necessaria | Status | Bloqueia qual wave/ID-visao | Workaround sandbox | Criterio de desbloqueio |
|---|---|---|---|---|---|---|---|
| EXT-ENV-001 | Orchestrator tokens for Railway/Vercel env inventory (`RAILWAY_TOKEN`, `VERCEL_TOKEN`) | Daniel | Tokens available via secret manager/env without printing values | Open | W0, V10, V12, V19 | Local code/env-name inventory only | Commands can list env keys/status without exposing values |
| EXT-ADM-001 | `adm.kloel.com` Vercel env/deploy smoke | Daniel | `NEXT_PUBLIC_ADMIN_API_URL` configured in the frontend-admin Vercel project and a deployed admin URL available for smoke | Open | W8/W9, V22 | Local `frontend-admin` typecheck/test/build with dummy API URL | `adm.kloel.com` loads login and authenticated admin routes against the production admin API |
| EXT-META-001 | Meta App Domains and Valid OAuth Redirect URIs | Daniel | Dashboard checklist completed for app/domain/backend callback | Open | W2, V10 | Code-side diagnostic tree through generated URL/callback route | Meta OAuth URL accepted by Meta without domain/redirect error |
| EXT-META-002 | Meta App Review / Live mode / approved scopes | Daniel | Approved scopes list or test-user dev mode evidence | Open | W2, V10/V13 | Development app with Test Users | Graph calls return 200 for pages, IG, WABA, webhook subscriptions |
| EXT-META-003 | WhatsApp Embedded Signup Config IDs | Daniel | Active config IDs per channel | Open | W2, C-WA | Existing Cloud API provider with test phone if configured | Embedded Signup returns WABA/phone_number_id and persists encrypted token |
| EXT-META-004 | Meta Graph test token available via env/secret manager | Daniel | `META_TEST_ACCESS_TOKEN` available to the orchestrator without printing value | Open | W2 step 10, V10 | Code-side URL/callback tests and public callback smoke | Graph API listing calls for pages, IG business account, WABA and ad accounts return 200 |
| EXT-TT-001 | TikTok developer app review/sandbox | Daniel | TikTok app state, redirect URI, scopes, sandbox users | Open | W3, V11 | Sandbox OAuth if available | OAuth/status/webhook smoke succeeds or limitations documented by API state |
| EXT-GOOGLE-001 | Google OAuth consent + Gmail restricted scopes | Daniel | OAuth client, consent test users, restricted scope verification status | Open | W4 EMAIL-2..6, V12 | Internal/test-user Gmail account | Gmail OAuth token persists, refresh works, send/read smoke passes |
| EXT-GOOGLE-002 | Google Pub/Sub topic for Gmail push | Daniel | Topic/subscription configured and webhook URL registered | Open | W4 EMAIL-3 | Polling fallback | Inbound email appears in unified inbox within 60s |
| EXT-MS-001 | Microsoft Azure app registration | Daniel | Client ID/secret/tenant, redirect URI, scopes | Open | W4 EMAIL-7+, V12 | Tenant test app; code-side Microsoft OAuth base is implemented and locally tested | Outlook OAuth callback succeeds and Graph inbound/outbound parity passes |
| EXT-EMAIL-001 | Test mailboxes | Daniel | Gmail, Microsoft and IMAP/SMTP test accounts | Open | W4, Golden Path 5/7/9 | One provider at a time | Inbound/outbound captured without real customer data |
| EXT-PAY-001 | Payment gateway sandbox/live account | Daniel | Mercado Pago/other sandbox credentials and webhook secret | Open | W7, V19 | Sandbox checkout | Paid sandbox order reconciles to wallet/report |
| EXT-REAL-CHANNELS-001 | Real test Meta/TikTok/Email accounts | Daniel | Test WhatsApp Business, IG/FB Page, TikTok Creator/Business, mailbox accounts | Open | W2/W3/W4/W7 | Provider test users/sandbox accounts | Golden Path channel milestones capture real request/response evidence |

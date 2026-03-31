# PULSE REPORT — 2026-03-31T22:43:17.594Z

## Health Score: 96/100
`███████████████████░` 96%

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 850 | 4 dead handlers |
| API Calls | 591 | 0 no backend |
| Backend Routes | 631 | 0 empty |
| Prisma Models | 107 | 0 orphaned |
| Facades | 1 | 1 critical, 0 warning |
| Proxy Routes | 48 | 0 no upstream |

## Breaks (93 total)

### Facades (Fake/Stub Code) (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | frontend/src/app/(main)/whatsapp/page.tsx:79 | [fake_save] setTimeout resets state without API call — fake save feedback |

### Dead UI Handlers (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:297 | button "{c.status === 'active' ? IC.pause(12) : IC.play(12)}" has dead handler |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:481 | button "{c.status === 'active' ? IC.pause(12) : IC.play(12)}" has dead handler |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:1294 | clickable "(sem texto)" has dead handler |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:1353 | clickable "(sem texto)" has dead handler |

### Backend Routes Not Called by Frontend (88)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:34 | POST /ai/assistant/analyze-sentiment is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:39 | POST /ai/assistant/summarize is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:44 | POST /ai/assistant/suggest is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:58 | POST /ai/assistant/pitch is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:99 | POST /ai/kb/upload is not called by any frontend code |
| INFO | backend/src/audio/audio.controller.ts:8 | POST /audio/synthesize is not called by any frontend code |
| INFO | backend/src/audit/audit.controller.ts:15 | GET /audit is not called by any frontend code |
| INFO | backend/src/auth/auth.controller.ts:243 | POST /auth/send-verification is not called by any frontend code |
| INFO | backend/src/autopilot/autopilot.controller.ts:314 | POST /autopilot/process is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:51 | GET /checkout/public/r/:code is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:56 | GET /checkout/public/:slug is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:106 | POST /checkout/public/shipping is not called by any frontend code |
| INFO | backend/src/copilot/copilot.controller.ts:13 | POST /copilot/suggest is not called by any frontend code |
| INFO | backend/src/copilot/copilot.controller.ts:33 | POST /copilot/suggest-multiple is not called by any frontend code |
| INFO | backend/src/kloel/ad-rules.controller.ts:63 | PUT /ad-rules/:id is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:35 | POST /kloel/audio/:workspaceId/transcribe is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:74 | POST /kloel/audio/:workspaceId/transcribe-url is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:98 | POST /kloel/audio/:workspaceId/transcribe-base64 is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:122 | POST /kloel/audio/:workspaceId/text-to-speech is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:150 | POST /kloel/audio/:workspaceId/text-to-speech-base64 is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:45 | GET /diag is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:55 | GET /diag/full is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:107 | GET /diag/workspace/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:173 | GET /diag/metrics is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:225 | GET /diag/errors is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:132 | POST /kloel/memory/save is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:152 | POST /kloel/pdf/process is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:270 | POST /kloel/onboarding/:workspaceId/start is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:287 | POST /kloel/onboarding/:workspaceId/chat is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:308 | POST /kloel/onboarding/:workspaceId/chat/stream is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:328 | GET /kloel/onboarding/:workspaceId/status is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:342 | GET /kloel/followups is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:352 | GET /kloel/followups/:contactId is not called by any frontend code |
| INFO | backend/src/kloel/leads.controller.ts:11 | GET /kloel/leads/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:24 | POST /mercadopago/:workspaceId/connect is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:44 | POST /mercadopago/:workspaceId/disconnect is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:52 | GET /mercadopago/:workspaceId/status is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:59 | POST /mercadopago/:workspaceId/pix is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:75 | POST /mercadopago/:workspaceId/preference is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:100 | GET /mercadopago/:workspaceId/payments is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:116 | GET /mercadopago/:workspaceId/payment/:paymentId is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:130 | POST /mercadopago/:workspaceId/refund/:paymentId is not called by any frontend code |
| INFO | backend/src/kloel/onboarding.controller.ts:24 | POST /kloel/onboarding-legacy/start/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/onboarding.controller.ts:32 | POST /kloel/onboarding-legacy/respond/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/onboarding.controller.ts:43 | GET /kloel/onboarding-legacy/status/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/payment.controller.ts:107 | GET /kloel/payments/status is not called by any frontend code |
| INFO | backend/src/kloel/pdf-processor.controller.ts:109 | POST /kloel/pdf/:workspaceId/text is not called by any frontend code |
| INFO | backend/src/kloel/sales.controller.ts:362 | GET /sales/:id is not called by any frontend code |
| INFO | backend/src/kloel/smart-payment.controller.ts:81 | POST /kloel/payment/:workspaceId/create is not called by any frontend code |
| INFO | backend/src/kloel/smart-payment.controller.ts:118 | POST /kloel/payment/:workspaceId/negotiate is not called by any frontend code |
| INFO | backend/src/kloel/smart-payment.controller.ts:150 | GET /kloel/payment/:workspaceId/recovery/:paymentId is not called by any frontend code |
| INFO | backend/src/kloel/unified-agent.controller.ts:20 | POST /kloel/agent/:workspaceId/process is not called by any frontend code |
| INFO | backend/src/kloel/unified-agent.controller.ts:60 | POST /kloel/agent/:workspaceId/simulate is not called by any frontend code |
| INFO | backend/src/kloel/upload.controller.ts:136 | POST /kloel/upload/multiple is not called by any frontend code |
| INFO | backend/src/kloel/webinar.controller.ts:43 | PUT /webinars/:id is not called by any frontend code |
| INFO | backend/src/kloel/webinar.controller.ts:57 | DELETE /webinars/:id is not called by any frontend code |
| INFO | backend/src/kloel/whatsapp-brain.controller.ts:82 | POST /kloel/whatsapp/simulate/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/whatsapp-brain.controller.ts:99 | GET /kloel/whatsapp/status is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:79 | POST /kyc/security/change-password is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:96 | POST /kyc/submit is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:103 | POST /kyc/auto-check is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:108 | POST /kyc/:agentId/approve is not called by any frontend code |
| INFO | backend/src/launch/launch.controller.ts:28 | POST /launch/launcher is not called by any frontend code |
| INFO | backend/src/launch/launch.controller.ts:37 | POST /launch/launcher/:id/groups is not called by any frontend code |
| INFO | backend/src/marketing/marketing.controller.ts:67 | GET /marketing/channels is not called by any frontend code |
| INFO | backend/src/media/media.controller.ts:46 | POST /media/video is not called by any frontend code |
| INFO | backend/src/media/media.controller.ts:54 | GET /media/job/:id is not called by any frontend code |
| INFO | backend/src/media/video.controller.ts:8 | GET /media/video/ping is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:31 | GET /ops/queues is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:36 | GET /ops/queues/:name/dlq is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:51 | POST /ops/queues/:name/dlq/retry is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:67 | POST /ops/queues/:name/dlq/purge is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:102 | GET /ops/queues/billing/suspended is not called by any frontend code |
| INFO | backend/src/partnerships/partnerships.controller.ts:79 | GET /partnerships/affiliates/:id/performance is not called by any frontend code |
| INFO | backend/src/public-api/public-api.controller.ts:19 | POST /api/v1/messages is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:86 | GET /reports/ad-spend is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:107 | POST /reports/send-email is not called by any frontend code |
| INFO | backend/src/scrapers/scrapers.controller.ts:41 | POST /scrapers/jobs is not called by any frontend code |
| INFO | backend/src/scrapers/scrapers.controller.ts:66 | POST /scrapers/jobs/:id/import is not called by any frontend code |
| INFO | backend/src/video/video.controller.ts:12 | POST /video/create is not called by any frontend code |
| INFO | backend/src/video/video.controller.ts:27 | GET /video/job/:id is not called by any frontend code |
| INFO | backend/src/voice/voice.controller.ts:28 | POST /voice/profiles is not called by any frontend code |
| INFO | backend/src/voice/voice.controller.ts:37 | GET /voice/profiles is not called by any frontend code |
| INFO | backend/src/voice/voice.controller.ts:48 | POST /voice/generate is not called by any frontend code |
| INFO | backend/src/webhooks/webhooks.controller.ts:101 | POST /hooks/finance/:workspaceId/recent is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:548 | POST /whatsapp-api/cia/conversations/:conversationId/resume is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1109 | POST /whatsapp-api/send/:phone is not called by any frontend code |
| INFO | backend/src/whatsapp/whatsapp.controller.ts:65 | POST /whatsapp/:workspaceId/incoming is not called by any frontend code |

---

## CORRECTION PROMPT

Copy and paste the following into Claude Code to fix all critical and warning issues:

```
Fix the following codebase connectivity issues found by PULSE:

## Facades to fix
Replace fake/stub code with real implementations:
1. **frontend/src/app/(main)/whatsapp/page.tsx:79** — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: `setTimeout(() => setSessionActionMsg(null), 4000)`

## Dead UI handlers
Connect these UI elements to real backend operations:
2. **frontend/src/components/kloel/anuncios/AnunciosView.tsx:297** — button "{c.status === 'active' ? IC.pause(12) : IC.play(12)}" has dead handler
3. **frontend/src/components/kloel/anuncios/AnunciosView.tsx:481** — button "{c.status === 'active' ? IC.pause(12) : IC.play(12)}" has dead handler
4. **frontend/src/components/kloel/parcerias/ParceriasView.tsx:1294** — clickable "(sem texto)" has dead handler
5. **frontend/src/components/kloel/parcerias/ParceriasView.tsx:1353** — clickable "(sem texto)" has dead handler

```
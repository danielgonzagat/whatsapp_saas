# KLOEL — IMPLEMENTATION PLAN

> Updated: 2026-03-31 | PULSE: 96% | ROUTE_NO_CALLER: 88

## Session 1 Summary (2026-03-31)

### Completed
1. Fixed PULSE scanner — multiline apiFetch, API module map, buildUrl pattern detection
2. Connected ~160 routes across all modules
3. Created AUDIT_FEATURE_MATRIX.md
4. Financial tests: PASS (5/5)

### PULSE Progress: 89% → 96%
- ROUTE_NO_CALLER: 249 → 88

## Remaining Work (88 routes)

### Internal/Admin/Deprecated (~30 routes — mark in PULSE or leave as-is)
- Diagnostics: /diag/* (5)
- Ops: /ops/* (5)
- Audio: /kloel/audio/* (5)
- PDF: /kloel/pdf/* (2)
- Copilot: /copilot/* (2)
- Agent process/simulate (2)
- Autopilot process (1)
- Public API /api/v1/messages (1)
- Onboarding legacy (3)
- Auth send-verification (1)
- WhatsApp incoming/send (2)
- Upload multiple (1)

### PULSE Detection Gaps (~15 routes — fix scanner)
- KYC mutations via kycMutation wrapper (4): submit, change-password, auto-check, approve
- Checkout public routes via server-side fetch (3): r/:code, :slug, shipping
- Followups via misc.ts wrapper (2)
- Memory save via misc.ts wrapper (1)
- Reports ad-spend via buildUrl (1)
- Marketing channels (1)
- Others (3)

### Genuinely Uncalled (~43 routes — need frontend work)

**P1 — Payment Gateway**
- MercadoPago (8): connect, disconnect, status, pix, preference, payments, refund
- Smart Payment (3): create, negotiate, recovery

**P1 — Content**
- AI Assistant (4): analyze-sentiment, summarize, suggest, pitch
- Knowledge Base (1): kb/upload
- Webinar (2): update, delete
- Video/Voice (5): create, profiles, generate

**P2 — Features**
- Scrapers (2): create job, import
- Launch (2): launcher, groups
- Ad Rules (1): update rule
- Media (2): video, job/:id
- Sales detail (1): GET /sales/:id
- Onboarding conversational (4): start, chat, stream, status
- WhatsApp simulate (1)
- WhatsApp status (1)
- Partnerships performance (1)
- Leads (1): kloel/leads
- Hooks finance recent (1)
- Audio synthesize (1)
- Reports send-email (1)
- Checkout public shipping (1)

## Next Session
1. Fix PULSE detection for kycMutation wrapper and checkout public routes
2. Mark internal routes in PULSE exclusion list
3. Connect MercadoPago settings page
4. Connect remaining P1 routes
5. Convert Video/Voice shell to setup state

# Wave Q/9 — Strict-mode sweep auth + billing + checkout + flows + whatsapp + others (~200 errors)

## Mission

Eliminate strict-mode tsc errors in remaining backend modules NOT covered by Q/7 (kloel) or Q/8 (payments/marketing/webhooks):
- `backend/src/auth/` (9 errors)
- `backend/src/billing/` (4 errors)
- `backend/src/checkout/` (6 errors)
- `backend/src/flows/` (9 errors)
- `backend/src/whatsapp/` (19 errors)
- `backend/src/calendar/` (8 errors)
- `backend/src/ai-brain/` (8 errors)
- `backend/src/queue/` (8 errors)
- `backend/src/autopilot/` (5 errors)
- `backend/src/admin/` (5 errors)
- `backend/src/integrations/` (9 errors)
- `backend/src/anuncios/`, `backend/src/audit/`, `backend/src/bootstrap.ts`, `backend/src/cia/`, `backend/src/common/`, `backend/src/gdpr/`, `backend/src/notifications/` etc.

## Pre-read

1. `CLAUDE.md` — relevant section per file area (auth → REGRA DE AUTH, whatsapp → REGRA DE WHATSAPP / AUTOPILOT, etc.)
2. `AGENTS.md`
3. `scripts/decomp/opencode-subagent-delegation-rules.md`

## Method

Same as Wave Q/7 (see batch-6/strict-mode-kloel.md). Apply per-error-code fix recipes mechanically.

## Constraints (CLAUDE.md)

- No bypass tokens, no commits, no protected files
- WhatsApp/autopilot: preserve session lifecycle integrity; never break idempotency or workspace isolation
- Auth: never log tokens; never weaken JWT verification
- Checkout: bigint cents; never float for money

## Definition of Done

- `cd backend && npx tsc --noEmit 2>&1 | grep 'error TS' | wc -l` returns 0 (full backend clean — combined with Q/7 and Q/8)
- `npx eslint <touched paths>` clean
- `npx jest` (full suite) no regression (specs Q/7 + Q/8 + Q/9 all green)
- Report: file count, total errors fixed

## Hard stop conditions

- A type fix would expose a real bug in production logic — STOP, report with file:line
- A spec breaks because the source semantics change — STOP, report

# Wave Q/9 — Backend strict-mode REST (~200 errors across auth/billing/checkout/whatsapp/etc)

## Mission

Eliminate all remaining backend strict-mode tsc errors NOT in `src/kloel/` and NOT in `src/payments|marketing|webhooks/`. Target backend tsc clean (with Q/7 + Q/8 separately).

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE AUTH, REGRA DE WHATSAPP/AUTOPILOT, REGRA DE CHECKOUT, REGRA DE NÃO-INVENÇÃO
3. `AGENTS.md`

## Ownership set

All `backend/src/**/*.ts` files EXCEPT:
- `backend/src/kloel/**` (Wave Q/7's territory)
- `backend/src/payments/**` (Wave Q/8)
- `backend/src/marketing/**` (Wave Q/8)
- `backend/src/webhooks/**` (Wave Q/8)
- Any `*.spec.ts` file (only modify if a real behavior fix is needed)

Target areas with errors:
- auth/, billing/, checkout/, flows/, whatsapp/, calendar/, ai-brain/, queue/, autopilot/, admin/, integrations/, anuncios/, audit/, bootstrap.ts, cia/, common/, gdpr/, notifications/, etc.

## Method

Same as Wave Q/7 (see batch-7/wave-q-backend-kloel.md). Apply per-error-code fix recipes mechanically. For module-specific rules:

- **auth**: never log tokens, never weaken JWT verification, preserve session lifecycle
- **whatsapp**: preserve idempotency on messages, preserve workspace-scoped sessions, never break catchup logic
- **checkout**: bigint cents always, append-only ledger
- **autopilot**: preserve audit trail (decision log per workspace + correlationId), handoff signal must keep working
- **flows**: preserve flow execution state machine
- **integrations**: never log accessToken/refreshToken (only first-4 + last-4 masked)

## Constraints (CLAUDE.md)

- NO bypass tokens
- NO commits — orchestrator commits after Tier-3 validation
- NO modifying protected files
- NO modifying tsconfig flags

## Definition of Done

- `cd backend && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "src/(kloel|payments|marketing|webhooks)" | wc -l` returns 0
- Combined with Q/7 + Q/8: full `backend && npx tsc --noEmit` returns 0
- Backend build (`npm run build`) succeeds
- `npx jest` no regression
- Report per-module: errors before / errors after

## Hard stop conditions

- A type fix would expose a real bug — STOP, report
- A spec breaks because source semantics change — STOP, report
- Encountered missing import or truncated module — STOP, report (do NOT git restore)

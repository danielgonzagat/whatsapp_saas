# Wave H/Coverage-Kloel — Remaining kloel services (KLOEL-C/D/E/F/G/H ~33 services)

## Mission

Create `.spec.ts` files for the remaining kloel services without coverage. The kloel module has 44 services without spec; KLOEL-A and KLOEL-B already delivered some specs. Cover the rest.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE QUALIDADE DE IA
3. `AGENTS.md`

## Discovery

```bash
cd /Users/danielpenin/whatsapp_saas/backend
find src/kloel -name "*.service.ts" | while read f; do
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && echo "$f"
done
```

## Target slices (from prompt A.3)

### KLOEL-C: kloel-thinker, kloel-thread-search, kloel-thread-summary, kloel-thread, kloel-tool-dispatcher
### KLOEL-D: kloel-tool-executor-billing, kloel-tool-executor-crm, kloel-tool-executor-whatsapp, kloel-tool-executor
### KLOEL-E: kloel-whatsapp-tools, kloel-workspace-context-data, kloel-workspace-context-linked-product, kloel-workspace-context, leads
### KLOEL-F: marketing-skill, memory-crud, memory-management, memory-search, memory
### KLOEL-G: order-alerts, pdf-processor, unified-agent-actions-billing, unified-agent-actions-commerce, unified-agent-actions-crm, unified-agent-actions-messaging
### KLOEL-H: unified-agent-actions-sales, unified-agent-actions-workspace, unified-agent-actions, unified-agent-context-data, unified-agent-context, unified-agent-response, whatsapp-brain

## Spec template

Follow the pattern from previously delivered specs like `backend/src/kloel/kloel-chat-tools.service.spec.ts` (jest + TestingModule + mocked Prisma).

## Ownership set

ONLY `backend/src/kloel/**/*.spec.ts` (CREATE new). DO NOT modify the source `.service.ts` files.

## Constraints

- NO bypass tokens, NO commits
- Mock OpenAI / chatCompletionWithRetry — never real LLM calls
- Workspace isolation tested
- Audit trail (autopilotEvent) preservation

## Definition of Done

- Each kloel service without spec now has one
- `npx jest --testPathPatterns="kloel/" --coverage` ≥70% lines per touched file
- Report per-service coverage

## Hard stop conditions

- Service needs real LLM call to test — STOP, report
- Service has a real bug discovered while writing spec — STOP, report P0

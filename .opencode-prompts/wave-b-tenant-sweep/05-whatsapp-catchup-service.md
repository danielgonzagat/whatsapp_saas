# Wave B / Slice 5 — TenantSweep-WhatsappCatchupService

## Mission

Eliminate cross-tenant query bugs in `backend/src/whatsapp/whatsapp-catchup.service.ts`
and its provider-registry decomposition. WhatsApp is the core business surface —
cross-tenant leaks here mean messages, contacts, or sessions of one workspace
visible to another.

## Ownership set

- `backend/src/whatsapp/whatsapp-catchup.service.ts`
- `backend/src/whatsapp/whatsapp-catchup.service.spec.ts` (create if missing)
- `backend/src/whatsapp/whatsapp-catchup.normalizers.ts` (only if imported by
  catchup.service and changes are needed to satisfy the workspace-filter)
- `backend/src/whatsapp/providers/provider-registry.ts` — IF the file exists
  and is the registry used by catchup.

Outside this set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE WHATSAPP / AUTOPILOT + REGRA DE BANCO DE DADOS.
2. `AGENTS.md` — full read.
3. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md` — full.
4. `docs/adr/0001-whatsapp-source-of-truth.md` — context.
5. `backend/src/whatsapp/whatsapp-catchup.service.ts` — full read.
6. The wave-18 recent commit `66927447a refactor(whatsapp): wave-18
   provider-registry + catchup orchestrator decomposed` — read its diff to
   understand the current architecture.

## Special rules for whatsapp

- Every WhatsApp session is scoped to a `workspaceId`. NEVER look up a session
  by `phoneNumberId` alone.
- Inbound message normalization MUST verify the inbound payload's
  `phoneNumberId` matches an active session in the target workspace BEFORE
  persisting anything.
- Idempotency: every received message has an external `messageId`. Persist
  via `prisma.message.upsert({ where: { workspaceId_externalId: {...} } })` —
  if no compound unique exists, report it as a schema bug (NEEDS schema fix
  in separate slice).
- Logs MAY include workspaceId + messageId. MUST NOT include message body.

## Pattern to apply

Same as previous slices: workspaceId in every where, AdminGlobalOperation
decorator for legit cross-workspace ops (rare).

## Forbidden moves

- Logging message body to console/winston/etc.
- Skipping idempotency on inbound (would cause duplicate messages).
- Touching the WAHA or Meta provider files directly — they're separate slices
  if needed. Catchup orchestrator only.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/whatsapp/whatsapp-catchup.service.ts \
  src/whatsapp/whatsapp-catchup.service.spec.ts \
  src/whatsapp/whatsapp-catchup.normalizers.ts 2>/dev/null
npx jest --testPathPattern=whatsapp/whatsapp-catchup
cd ..
node scripts/ops/check-tenant-filter.mjs --path backend/src/whatsapp/whatsapp-catchup 2>&1 | tail -20
```

## Definition of done

- Zero tenant-filter violations in `whatsapp-catchup.service.ts`.
- Inbound normalization explicitly verifies workspace match before persisting.
- Idempotency invariant proven by spec (replay same messageId → no duplicate).
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass tokens, no new any.
- No commits. JSON delivery report.

## Hard stop conditions

- If `Message` model doesn't have compound unique on `(workspaceId,
  externalId)` — STOP, report (schema fix needed).
- If `WhatsAppSession` lookup is by `phoneNumberId` alone anywhere — STOP,
  report this is a pre-existing design bug needing ADR review.
- If file exceeds 600 → 800 → decomp is separate wave, STOP.

# Wave 16 — CIA frontend mode visibility (Gap 8 follow-up)

> Authored by PI atomic subagent `w16-cia-frontend-mode-visibility` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Files modified

| File | Change |
|------|--------|
| `backend/src/cia/cia.service.ts` | Added `pipelineState` query via `prisma.pipelineState.findUnique` in `getSurface` Promise.all; added `commercial: { pipelineMode }` to return payload |
| `backend/src/cia/cia.service.spec.ts` | Added `pipelineState` mock to prisma fixture; added `commercial pipelineMode` describe block with 3 tests (active, legacy default, shadow) |
| `frontend/src/lib/api/cia.ts` | Added `commercial?: { pipelineMode: 'shadow' \| 'active' \| 'legacy' }` to `CiaSurfaceResponse` interface |
| `frontend/src/app/(main)/cia/components/CiaHeader.tsx` | Added inline pipeline mode chip — grey "Shadow" label or green "Active" label in the header badge row |

## 2. Backend + frontend tsc result

```
Backend:  PASS  (tsc -p tsconfig.build.json --noEmit)
Frontend: PASS  (tsc --noEmit)
```

## 3. Spec result

```
PASS src/cia/cia.service.spec.ts (13.558 s)
  CiaService
    ✓ ignores malformed human_task payloads instead of spreading string characters
    ✓ normalizes malformed metadata before persisting approved human tasks
    getSurface subtitle (7 tests) … all pass
    MIND delegation (5 tests) … all pass
    commercial pipelineMode
      ✓ returns pipelineMode from pipelineState when present
      ✓ defaults to legacy when pipelineState is missing
      ✓ returns shadow pipelineMode when pipeline is in shadow

Tests: 17 passed, 17 total
```

## 4. Screenshot-equivalent ASCII of the new chip

```
┌─────────────────────────────────────────────────────────────────────────┐
│  KLOEL                                                                  │
│  Cuidando do seu negócio no WhatsApp                                    │
│                                                                         │
│  ┌──────────┐ ┌───────┐ ┌──────────────────┐ ┌─────────────┐          │
│  │ workspace │ │ IDLE  │ │ Operacao obs.    │ │ Active      │          │
│  │  Badge    │ │ Badge │ │   Badge          │ │  (green)    │          │
│  └──────────┘ └───────┘ └──────────────────┘ └─────────────┘          │
│                                              ┌─────────────┐          │
│                                              │ Shadow      │          │
│                                              │  (grey)     │          │
│                                              └─────────────┘          │
│                                                                         │
│  Shadow mode: grey pill (bg: rgb(58,58,63), text: rgb(155,155,160))    │
│  Active mode: green pill (bg: rgba(16,185,129,0.12), text:             │
│               rgb(127,226,188))                                         │
│                                                                         │
│  The chip appears inline in the CiaHeader badge row, to the right of    │
│  the existing runtime/error badges. No new tab or section — just an     │
│  inline indicator matching the Monitor design system.                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Design notes

- **Backend**: Queries `PipelineState.state` via existing `PrismaService` (no new module dependency). Falls back to `'legacy'` when no row exists.
- **Frontend**: The chip is a plain `<span>` with custom inline styles using Monitor palette tokens — no new component abstraction. Only renders for `'shadow'` or `'active'`; `'legacy'` is intentionally invisible to avoid noise.
- **Tests**: Three spec cases cover active, missing/default, and shadow states.

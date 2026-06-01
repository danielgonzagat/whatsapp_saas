# SLICE S9 — Mobile / a11y / perf (SERIAL, after S8)

## Escopo
Make the literal graph viable on mobile + accessible + performant WITHOUT changing
the desktop byte-identity. Throttle physics; responsive overlay; a11y roles.

## Arquivos (writes)
- `engine/KloelGraphEngine.ts` (physics throttle/RAF cap; pause when overlay open)
- `engine/KloelGraphCanvas.tsx` (responsive viewport, touch pan/zoom, reduced-motion)
- `overlays/KloelGraphOverlayChrome.tsx` (responsive 80vw×80vh → full-screen on small;
  focus trap, `aria-modal`, labelled-by active node, ESC close)

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on engine + overlay chrome.
2. Perf: cap `physicsTick` RAF; freeze when `selectedNode` open; memoize layout.
   Do NOT change layout MATH (would break byte-identity) — only WHEN it runs.
3. a11y: dialog role/label/focus-trap/ESC; `prefers-reduced-motion` disables physics
   animation (static positions identical to a settled sim).
4. Mobile: touch drag/pinch; overlay full-screen < breakpoint.
5. Byte-identity gate at DESKTOP viewport MUST still be GREEN (mobile is additive).
6. Lighthouse (chrome-devtools `lighthouse_audit`) perf+a11y; `run_tsc`/`run_eslint`.
7. release + commit.

## Stop conditions
Desktop byte-identity regresses · reduced-motion changes settled positions.

---
@import _PLAYBOOK.md

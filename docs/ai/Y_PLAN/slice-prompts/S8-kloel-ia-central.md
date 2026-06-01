# SLICE S8 — KLOEL (IA central): Novo Chat / Buscar / Imagens / Recentes

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0 + S3 + S4 + S5 + S6 + S7 (all galaxies).
CONCORRÊNCIA: **Fase 2a — serial, ALONE.** Runs after all galaxies land and
BEFORE S9 (Fase 2b). S8 and S9 are mostly disjoint by file BUT **both edit
`KloelGraph.routes.spec.ts`**, so they MUST NOT run concurrently — the 2a→2b
split guarantees no overlap. S8 acquires a lock ONLY on its own files
(`KloelGraphShell.tsx` + `KloelGraph.static-nodes.ts` + `KloelGraph.routes.spec.ts`).

## ESCOPO EXATO
3 of 4 nodes are WIRED with real data: kloel-chat→KloelDashboard (`/chat`); kloel-search→
CommandPalette full (`/kloel/threads/search`); kloel-recents→CommandPalette conversations
(`/kloel/threads/recent` + `useConversationHistory`). The ONE gap = **kloel-images** (canonical
map: TODO; no consumer reads `graphAction==='images'`). Wire it.

## DECISÃO DE PRODUTO (confirm with owner first)
- (a) PREFERRED — image-gen is a chat capability (`KLOEL_CHAT_QUICK_ACTIONS id:'image'` exists in
  `lib/kloel-chat.ts`): kloel-images → `/chat?graphAction=images`; KloelDashboard reads
  `graphAction==='images'` → preselect `activeCapability='image'`.
- (b) FALLBACK — no usable image surface: render honest setup-required/empty card for the
  kloel-images overlay (keep node visible). NEVER a seed image gallery.

## ARQUIVOS A EDITAR
- `frontend/src/components/kloel/graph/KloelGraphShell.tsx` — add an `images` branch in
  `openNode()` / the `graphAction` useEffect (currently only `search`|`recents`).
  **CHOKEPOINT — acquire lock; coordinate with S0/S9/S10; micro-edit only.**
- `frontend/src/components/kloel/dashboard/KloelDashboard.tsx` — read `searchParams.graphAction
  ==='images'` → preselect `activeCapability='image'` (capability state already at line ~74).
- `frontend/src/components/kloel/graph/KloelGraph.static-nodes.ts` — REVIEW kloel-images node
  (already present); edit only if route/overlayLabel changes (CHOKEPOINT — lock).
- specs: `KloelGraph.routes.spec.ts` (kloel-images resolves like search/recents),
  `KloelGraphShell.spec.tsx` (images node behavior).
- `docs/ai/KLOELGRAPH_CANONICAL_SCREEN_MAP.md` — flip kloel-images row TODO → wired + evidence.

## DO NOT EDIT
`KloelGraphOverlay.tsx`, `KloelGraphShell.helpers.ts`, `KloelGraphTheme.tsx`,
`KloelGraphNodeButton.tsx`, `CommandPalette.tsx`, `SidebarRecents.tsx`, `lib/kloel-conversations.ts`,
`lib/api/kloel*.ts`, `lib/kloel-chat.ts`, `backend/src/kloel/*`, `KloelGraphPrototype.jsx`.

## PROTOCOLO POR FATIA
0. **Pre-flight:** respond to the orchestrator health-probe (Read known file + Bash echo
   round-trip); a mute runner is aborted, never counted green-by-absence. **Never use
   `awk`+`strftime`** in the toolchain (it was the observed tool-degradation trigger).
   Confirm Fase 2a (S9 NOT running) before locking.
1. `task_lock_acquire` + `atomic_lock_acquire` on S8's OWN files ONLY
   (`KloelGraphShell.tsx` + `KloelGraph.static-nodes.ts` + `KloelGraph.routes.spec.ts`);
   **verify** the grant before any write.
2. Anchor: `code_outline` KloelGraphShell to find the `graphAction` useEffect + `openNode`;
   `codegraph_node` on `KLOEL_CHAT_QUICK_ACTIONS`, KloelDashboard capability state;
   `protocol_hub_openapi` confirm `/kloel/threads*`, image-gen endpoint. If the
   `kloel-images` node is NOT already present in static-nodes, this becomes a larger
   (still S8-owned) static-nodes edit — note it; no new cross-slice collision.
3. Edit via `atomic_edit_symbol` (micro). Follow option (a) or (b) per owner.
4. Gate: `run_tsc` + `run_jest`/`run_vitest` on routes.spec + shell.spec + `affected_tests`
   — capture real output, never green by absence of output.
5. Chrome: navigate, click kloel-images node → either KloelDashboard opens in image mode
   (option a) or an honest setup-required card shows (option b). `take_screenshot`. Also smoke
   kloel-chat/search/recents still work. `list_network_requests` for `/kloel/threads*`.
   If the live stack will not boot, mark the live check **EXTERNAL_BLOCKED** with substitute
   evidence (unit + graphAction-switch test + canonical-map diff) — never green by un-run check.
6. PULSE clean. Release locks. Commit `feat(kloel): wire kloel-images node`.

## REGRAS
- If image-gen has no usable surface → honest setup-required, never a fake gallery.
- Shell is multi-worktree chokepoint — micro-edit, lock (verified), Fase 2a alone.
- Shell stays ≤400 lines.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests; CHROME chrome-devtools
navigate/click/take_screenshot/list_network_requests/list_console_messages; PULSE
pulse_scan_module; RUNTIME postgres pg_query read-only + railway get_logs. NUNCA --no-verify /
relaxar Codacy / editar protegidos.)

# Y_PARTITION — Re-aim Y onto the LITERAL KloelGraph prototype (Opção C)

> SÍNTESE output. Built from 7 domain maps. The maps' converged facts override
> the task's `undefined` placeholders. This file = the executable partition
> (slices, order, concurrency, pipeline). The seam contract is in
> `WIRING_CONTRACT.md`. One prompt per slice in `slice-prompts/`.

---

## 0. Resolved placeholders (the task left these `undefined`)

| Placeholder | Resolved value | Source |
|---|---|---|
| Output dir | `frontend/src/components/kloel/graph/_Y/` (this dir) | here |
| Worktree (write target) | **PENDING OWNER DECISION** — see DECISÃO. Default canonical = `/Users/danielpenin/whatsapp_saas-kg` (`feat/kloelgraph-literal-prototype @172c924ae`) which already holds the complete 6576-line literal + `KloelGraphClient.tsx` mount. | maps: ENGINE, Kloel, Conversar |
| Byte-identity gate target | `docs/ai/assets/kloelgraph-harness.html` (6593-line byte mirror with exact offsets) | maps: ENGINE |
| DECISÃO | **OWNER-GATED — Phase 0 decision gate.** state-based literal (Opção C) vs route-based shell (PR#473, live). Every map flags this as blocker #1. | all 7 maps |
| MCP PLAYBOOK | embedded verbatim in every slice-prompt (see `slice-prompts/_PLAYBOOK.md`) | here |

`decompositionFirst = true`. Decomposition is **Fase 0 SERIAL** and must render
**byte-identical** before any galaxy starts.

---

## 1. THE FORK (read before anything) — two physical representations of Y

The maps unanimously establish that **two different things both call themselves
"the KloelGraph"** and they live in different worktrees:

- **A) ROUTE-BASED shell (LIVE, PR#473 merged).** `KloelGraphShell.tsx` builds
  nodes from `KloelGraph.static-nodes.ts` + `KloelGraph.product-nodes.ts`, and
  renders the **real Next.js route page** as `{children}` inside
  `KloelGraphOverlay` (80vw×80vh `role=dialog`, almost-invisible chrome,
  `closeOverlay` preserves `?graph=1`). The 671-line `KloelGraphPrototype.jsx` in
  THIS checkout is **dead code** on this path (no importer).
- **B) STATE-BASED literal (Opção C target).** `KloelGraphPrototype.jsx` (6576
  lines, in `whatsapp_saas-kg`) is a single self-contained file: engine +
  `KloelInner` root state + `NodePanel` overlay router by `node.type` +
  inline screens per domain. Mounted client-only via `KloelGraphClient.tsx` →
  `dynamic(import('./KloelGraphPrototype'), {ssr:false})`.

**Opção C = "render byte-identical to the owner's literal prototype" ⇒ adopt B.**
That swaps the navigation model currently in production. THIS IS THE DECISION
GATE. Do NOT port `NodePanel`/`KloelInner` until the owner confirms B over A.

> Honest caveat carried from every map: tool runtime was intermittently mute this
> wave. Offsets below come from grep that DID render; the full bodies of
> `NodePanel@4441..5258` and `KloelInner@6287..end` must be re-read on a stable
> runtime before the port edits land (read-only planning is unaffected).

---

## 2. Slice list (10 slices; per-file DISJOINT)

Slices are disjoint **by file**. Phase-0 (S0) is serial and owns the monolith
split. The 7 galaxies (S1–S7) then run in parallel, each editing **body-only of
its own carved module** + creating its own `*.data` adapter. S8 (overlay/routing/
deep-link) and S9 (mobile/a11y/perf) and S10 (verify+integrate) are serial tails.

| # | Slice | Owns (writes) | Reads-only | Tier |
|---|---|---|---|---|
| **S0** | **Decomposition + byte-identity gate (SERIAL Fase 0)** | carve monolith → `engine/`, `overlays/`, `state/`, `seeds/`, `domains/<name>/` skeletons; `__tests__/KloelGraph.byte-identity.spec.ts`; `seeds/*`, `engine/KloelGraphEngine.ts`, `engine/KloelGraphCanvas.tsx`, `overlays/KloelGraphOverlayChrome.tsx`, `overlays/KloelGraphNodePanel.tsx` (router shell, empty `SCREEN_BY_TYPE`), `state/useKloelGraphState.ts` | the literal `.jsx` + `harness.html` | XL |
| **S1** | Galaxy **Perfil + Dashboard** | `domains/perfil/*` (builder body + screen-map entries + `perfil.data.ts`) | `ContaView.tsx`, `HomeView.tsx`, `DashboardPostPaymentPanel`, `static-nodes.ts` | S (mostly done) |
| **S2** | Galaxy **Kloel (IA central)** | `domains/kloel/*` (`KloelKloelDomain.module.tsx`, `kloel-domain.data-adapter.ts`, chat motor swap) | `lib/kloel-conversations.ts`, `KloelBrand.tsx`, `UniversalComposer.tsx`, `CommandPalette.tsx` | M |
| **S3** | Galaxy **Criar / Produtos** | `domains/criar/*` (`KloelGraph.product-nodes.ts` body + optional `useProductNerveCenter.ts` + `KloelGraph.product-counts.ts`) | `ProdutosView`, `ProductNerveCenter*`, `/products/*` routes | S (core done; counts optional) |
| **S4** | Galaxy **Afiliar** | `domains/afiliar/*` (`afiliar.tsx`, `afiliar.data.ts`) | `ProdutosAfiliarSeTab`, `ParceriasShell`, `AffiliateDetailSheet`, `AffiliateProductDetail`, `usePartnerships.ts`, `lib/api/affiliate.ts` | M |
| **S5** | Galaxy **Educar (Área de Membros)** | `domains/educar/*` (`educar.builder.ts`, `educar.data.ts`, `EducarOverlayPanel.tsx`) | `ProdutosAreaMembrosTab` + `AreaMembros*`, `useMemberAreas.ts` | M (favorable) |
| **S6** | Galaxy **Conversar** | `domains/conversar/*` (`conversar.jsx`, `conversar.data.ts`) | `CRMPipelineView`, `ContactDetailDrawer`, `InboxWorkspace`, `VendasView`, `AnunciosView`, `AutopilotDecisionLog`, marketing `ChannelOnboarding`, `useCRM/useSales*/useAnuncios/useConversationHistory` | M-L |
| **S7** | Galaxy **Consultar (Carteira + Analytics)** | `domains/consultar/*` (`KloelGraph.wallet-data.ts`, wallet builder body) | `carteira.tsx` + `Carteira*`, `analytics/*` tabs, `useWallet*`, `lib/api/analytics.ts` | S |
| **S8** | Overlay / routing / deep-linking (SERIAL) | `KloelGraphShell.tsx`, `KloelGraph.routes.ts`, `overlays/KloelGraphNodePanel.tsx` `SCREEN_BY_TYPE` wiring | all domains | M |
| **S9** | Mobile / a11y / perf (SERIAL) | `engine/KloelGraphCanvas.tsx`, `engine/KloelGraphEngine.ts` (physics throttle), responsive overlay | all | M |
| **S10** | Verify + integrate (SERIAL) | spec files, flag-flip to remove sidebar | all | M |

---

## 3. Concurrency model

```
S0 (SERIAL, Fase 0) ──byte-identity GREEN──┐
                                           ├─ S1 ┐
                                           ├─ S2 │
                                           ├─ S3 │  7 galaxies IN PARALLEL
                                           ├─ S4 ├─ peakConcurrency = 7
                                           ├─ S5 │  (each: own carved module
                                           ├─ S6 │   body-only + own *.data)
                                           └─ S7 ┘
                                                  │ all galaxies GREEN
                                                  ▼
                                           S8 (SERIAL) overlay/routing/deep-link
                                                  ▼
                                           S9 (SERIAL) mobile/a11y/perf
                                                  ▼
                                          S10 (SERIAL) verify + integrate (flag flip)
```

- **peakConcurrency = 7** (the 7 galaxies), and ONLY after S0 is byte-identical.
- Galaxies are disjoint by file: each touches only its `domains/<name>/*` module
  + its `*.data` adapter. **No galaxy edits the shared shell, routes, static-nodes,
  overlay chrome, engine, or `SCREEN_BY_TYPE` map** — those are S0/S8 territory.
- This kills the documented "4–6 worktrees fighting the same seam" collision: the
  seam is split into per-domain modules in S0 before any galaxy starts.

---

## 4. Dependency order (hard edges)

1. **DECISÃO (owner gate)** → unblocks everything. If owner picks route-based (A),
   the partition degrades to "verify honest-empty in each real screen + tune
   static-nodes seeds" (S1/S3/S7 are already largely done; S0 becomes a no-op).
2. **S0 byte-identity GREEN** → unblocks S1..S7.
3. **S1..S7 GREEN** (each proves its domain renders byte-identical + honest-empty)
   → unblocks S8.
4. **S8 GREEN** (overlay router `SCREEN_BY_TYPE` wired, deep-linking, `?graph=`
   preserved) → unblocks S9.
5. **S9 GREEN** → unblocks S10.
6. **S10**: flip the flag that hides the old sidebar; final `lint+build+test`.

---

## 5. Pipeline (the loop every slice runs)

```
1. task_lock_acquire on the slice's files (task-graph MCP) — refuse if held
2. coordinate: confirm canonical worktree (whatsapp_saas-kg) holds the literal
3. READ the literal offsets for this domain (re-read if runtime was mute)
4. EDIT body-only of the carved module + create the *.data adapter (atomic-edit MCP)
5. byte-identity gate for this domain (Chrome devtools render diff vs harness.html)
6. honest-empty proof (loading/empty/error → zero entity nodes, never the seed)
7. test-runner: run_tsc + run_eslint + affected vitest for graph specs
8. task_update + task_lock_release
9. commit small, byte-neutral, conventional message
```

---

## 6. Cross-cutting invariants (apply to ALL slices)

- **Grafo byte-idêntico ao protótipo.** Seed determinístico in the gate:
  `defaultPlan@123` uses `Math.random()` for plan id, and `physicsTick@1223` uses
  alpha/jitter — both MUST be seeded/normalized so diffs aren't false positives.
- **Estado honesto obrigatório.** No fake seed reaches the user. Builders that
  early-return on `!data` keep that guard; loading/empty/error → `[]` entity nodes
  (only the static scaffold sun/branch nodes remain). NEVER the `*_SEED`.
- **Preserve a casca.** No restyle of inner screens. Overlay chrome stays
  almost-invisible. `closeOverlay` preserves `?graph=1` (PR#473 contract).
- **Protected files / no `git restore`.** `CLAUDE.md`-protected files are
  off-limits; planning is read-only; edits land only in carved modules.
- **`@ts-nocheck`/`eslint-disable` live ONLY on the verbatim literal file.** Carved
  modules are fully gated (no bypass comments — Codacy MAX-RIGOR LOCK).

---

## 7. Known blockers (carried from maps)

1. **DECISÃO owner-gate** (state-based vs route-based) — primary, blocks all ports.
2. **Source-of-truth worktree** — must use the 6576-line literal (`whatsapp_saas-kg`
   / `harness.html`), NOT the 671-line data-only `.jsx` in this checkout.
3. **4–6 concurrent kloelgraph worktrees** on the same seam — S0 split + task-graph
   locks are the mitigation; coordinate landing with the `whatsapp_saas-kg` agent.
4. **`Math.random` non-determinism** in `defaultPlan@123` + `physicsTick` — seed in
   the byte-identity gate.
5. **Runtime instability this wave** — re-read `NodePanel@4441..5258` and
   `KloelInner@6287..end` on a stable runtime before porting.
6. **Per-domain unconfirmed reads**: `lib/api/affiliate.ts` marketplace method
   name; `InboxWorkspaceProps`/`AutopilotDecisionLog` prop shapes;
   `/api/anuncios/*` live data; image LIST endpoint for `kloel.images`.

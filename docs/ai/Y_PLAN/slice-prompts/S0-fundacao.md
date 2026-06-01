# SLICE S0 — Fundação: node-source registry seam

> **Worktree**: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
> **Concurrency**: serial-alone (Phase 0). NO other slice runs concurrently.
> **Depends on**: nothing. This is the foundation every galaxy builds on.

---

## Mission

Refactor `KloelGraphShell.tsx` so its `graphNodes` memo is assembled from a
**GraphNodeSource registry** instead of inline node literals. After this slice,
the 6 galaxies can each ship a per-galaxy builder module WITHOUT editing the
Shell. The render MUST be byte-identical (same nodes, same order, same layout,
same edges, same zoom).

**Critical addition (anti-collision fix):** S0 also **creates each galaxy module
as an empty stub** (builder returning `[]`) in this same commit, and the Shell
statically imports each builder. This turns every galaxy's job into a body-only
EDIT of its own already-existing file — no galaxy ever adds an import to the
Shell, no galaxy ever edits the Shell. Zero file collision in Phase 1.

---

## Why this is serial-alone

`KloelGraphShell.tsx` (344 lines) is the #1 chokepoint. Every galaxy depends on
the registry seam existing. If two slices edit the Shell concurrently, byte
collision. So S0 runs ALONE, lands the seam + stubs, then unblocks all 6 galaxies.

---

## Files

**EDIT (exclusive, chokepoint — lock first):**
- `frontend/src/components/kloel/graph/KloelGraphShell.tsx`
- `frontend/src/components/kloel/graph/KloelGraphShell.helpers.ts`
- `frontend/src/components/kloel/graph/KloelGraph.routes.ts`
- `frontend/src/components/kloel/graph/KloelGraph.static-nodes.ts`
- `frontend/src/components/kloel/graph/KloelGraphShell.spec.tsx`
- `frontend/src/components/kloel/graph/KloelGraph.routes.spec.ts`

**CREATE:**
- `frontend/src/components/kloel/graph/KloelGraph.node-sources.ts` (registry + split target)
- `frontend/src/components/kloel/graph/KloelGraph.affiliate-nodes.ts` (empty stub → S3 fills)
- `frontend/src/components/kloel/graph/educar-graph-adapter.ts` (empty stub → S5 fills)
- `frontend/src/components/kloel/graph/KloelGraph.conversar-nodes.ts` (empty stub → S6 fills)
- `frontend/src/components/kloel/graph/adapters/dashboardMetricNodes.ts` (empty stub → S2 fills, optional slot)
- `frontend/src/components/kloel/graph/KloelGraph.node-sources.spec.ts` (registry-assembled byte snapshot — galaxies extend it)

**DO-NOT-EDIT:**
- `KloelGraphOverlay.tsx`, `KloelGraphTheme.tsx`, `KloelGraphPrototype.jsx`
- `KloelGraphNodeButton.tsx`, `KloelGraph.product-nodes.ts`

---

## Steps

1. **Pre-flight**: respond to orchestrator health-probe; never use `awk`+`strftime`.
2. **Lock**: `task_lock_acquire` + `atomic_lock_acquire` on all 6 chokepoint
   files; **verify** the grant before any write.
3. **Anchor**: read the current Shell `graphNodes` memo (codegraph/atomic_outline).
4. **Extract**: move the inline node-array assembly into a `GraphNodeSource[]`
   registry in `KloelGraph.node-sources.ts`. Shell imports + reduces it. Move ONLY
   the source-assembly logic — NEVER open/close or layout logic (would change render).
5. **Empty stubs**: create the 4 galaxy modules above, each exporting its §b
   builder symbol (`buildKloelGraphAffiliateNodes`, `buildEducarGraphNodes`,
   `buildKloelGraphConversarNodes`, `buildDashboardMetricNodes`) returning `[]`.
   Shell statically imports each and assigns to the contracted slot
   (`affiliateNodes`, `educarNodes`, `conversarNodes`, `perfilMetricNodes`).
6. **Frozen order**: keep the array order EXACTLY:
   `KLOEL_GRAPH_NODES → productNodes → affiliateNodes → educarNodes →
   conversarNodes → consultarNodes → perfilMetricNodes`.
7. **Scaffold resolver**: add `resolveEntityNode` stub for S9 to extend, with a
   **fallback to the plain-branch route** when the entity branch is absent (so the
   no-node-resolvable window in Phase 1 cannot mis-highlight the overlay).
8. **Strong byte-identical spec** (`KloelGraphShell.spec.tsx`): snapshot
   `graphNodes` with a product fixture; assert byte-identical by serializing
   `{ id, parentId, route, position, label, badge? }` for EACH node in order —
   NOT length/count. Regression in any field fails the gate.
9. **Registry-assembled spec** (`KloelGraph.node-sources.spec.ts`): snapshot the
   serialized assembled array; structure it so each galaxy can extend it when it
   registers its source (catches inter-galaxy integration regressions in Phase 1).
10. **Gate**: tsc + eslint + jest + both snapshot specs. Shell ≤400 lines (move
    assembly to node-sources.ts if over). PULSE clean.
11. **Release** locks; `task_update S0 done`.

---

## Acceptance

- `graphNodes` render byte-identical — snapshot serializes
  `{id,parentId,route,position,label,badge?}` per node in frozen order (NOT count).
- 4 empty galaxy stub modules exist, each exporting its contracted builder
  returning `[]`; Shell imports + assigns each to its slot.
- 5 galaxy slots exist in the frozen order; optional perfilMetric slot present.
- `KloelGraph.node-sources.ts` exports `GraphNodeSource` type + registry; is the
  named split target if Shell would exceed 400 lines.
- `resolveEntityNode` scaffold present with plain-branch fallback.
- `KloelGraph.node-sources.spec.ts` registry-assembled snapshot exists, extensible.
- Shell ≤400 lines; tsc/eslint/jest green; PULSE clean.

---

## MCP playbook (integral)

- **Pre-flight**: respond to health-probe (Read known file + Bash echo). No awk-strftime.
- **Lock**: `task_lock_acquire`, `atomic_lock_acquire` (every chokepoint file); verify grant.
- **Read/anchor**: `codegraph_search`, `codegraph_node`, `atomic_outline`,
  `code_read_symbol`, `gitnexus_query`.
- **Edit**: `atomic_edit_symbol`, `atomic_replace_body`, `atomic_insert_at`,
  `atomic_create_file` (preserve visual contract).
- **Test**: `run_tsc`, `run_eslint`, `run_jest` (test-runner MCP) — capture real output.
- **Verify**: Chrome devtools MCP — `navigate_page`, `take_snapshot` (or EXTERNAL_BLOCKED + substitute).
- **PULSE**: `pulse_scan_module`, `pulse_status`.
- **Release**: `atomic_lock_release`, `task_update`.

---

*End S0 prompt.*

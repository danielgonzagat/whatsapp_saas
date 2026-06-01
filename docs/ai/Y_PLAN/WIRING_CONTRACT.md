# WIRING_CONTRACT — KloelGraph Y

> Byte-level interface contract between S0 (the registry seam) and the 6
> galaxies. Read this before editing anything. Every symbol named here is a
> hard contract — drift breaks the build. The slot↔builder binding (§b) is
> 1:1 and byte-exact so S0 and each galaxy cannot drift.

---

## (a) The node-source registry seam (S0 owns)

S0 refactors `KloelGraphShell.tsx` so the `graphNodes` memo is assembled from a
registry of **GraphNodeSource** functions instead of inline literals:

```ts
// KloelGraph.node-sources.ts (created by S0)
export type GraphNodeSource = (ctx: GraphNodeSourceCtx) => KloelGraphNode[];

export interface GraphNodeSourceCtx {
  workspaceId: string | null;
  // read-only hook data injected by the Shell; each galaxy reads its slice
}
```

The Shell's `graphNodes` memo becomes (array ORDER is frozen law — see §i):

```ts
const graphNodes = useMemo(
  () => [
    ...KLOEL_GRAPH_NODES,        // static central + 6 suns (unchanged)
    ...productNodes,             // existing buildKloelGraphProductNodes
    ...affiliateNodes,           // S3 (default [] until galaxy fills the stub)
    ...educarNodes,              // S5
    ...conversarNodes,           // S6
    ...consultarNodes,           // S7
    ...perfilMetricNodes,        // S2 (optional)
  ],
  [workspaceId, productNodes, affiliateNodes, educarNodes, conversarNodes, consultarNodes, perfilMetricNodes],
);
```

### S0 ships the empty stubs in the SAME commit as the seam

To remove the "interface-no-seam" contract coupling, **S0 creates each galaxy
module as an empty stub** whose builder returns `[]`, in the seam commit. The
Shell statically imports each builder from its module. Because the file already
exists and exports the contracted symbol, the Shell compiles green between
phases, and each galaxy's job becomes a **body-only EDIT of its own file** — no
new import added to the Shell, no Shell edit by the galaxy, zero file collision.

Stub files S0 creates (each exports its §b builder returning `[]`):
- `frontend/src/components/kloel/graph/KloelGraph.affiliate-nodes.ts` (S3 fills)
- `frontend/src/components/kloel/graph/educar-graph-adapter.ts` (S5 fills)
- `frontend/src/components/kloel/graph/KloelGraph.conversar-nodes.ts` (S6 fills)
- `frontend/src/components/kloel/graph/adapters/dashboardMetricNodes.ts` (S2 fills, optional)

(S7's wallet/report adapter is optional and created by S7 if needed.)

---

## (b) Slot ↔ builder ↔ module binding (1:1 hard contract)

The Shell imports each builder and assigns it to exactly one named slot. This
table is byte-exact: the slot name, the builder symbol, and the module path
MUST match between S0 (the import + slot) and the galaxy (the export).

| Galaxy | Shell slot (variable) | Builder symbol (export) | Module file |
|---|---|---|---|
| S3 Afiliar | `affiliateNodes` | `buildKloelGraphAffiliateNodes` | `KloelGraph.affiliate-nodes.ts` |
| S5 Educar | `educarNodes` | `buildEducarGraphNodes` | `educar-graph-adapter.ts` |
| S6 Conversar | `conversarNodes` | `buildKloelGraphConversarNodes` | `KloelGraph.conversar-nodes.ts` |
| S2 Perfil | `perfilMetricNodes` | `buildDashboardMetricNodes` | `adapters/dashboardMetricNodes.ts` |
| S7 Consultar | `consultarNodes` | (optional) `buildConsultarGraphNodes` | `adapters/consultar-nodes.ts` (opt) |

Binding rule, restated for each: **the Shell imports `{ <builder> }` from
`<module>` and assigns its result to the `<slot>` slot.** Each builder is
`(ctx) => KloelGraphNode[]`, pure, honest-empty (returns `[]` when its hook data
is absent / loading / error). NEVER a seed.

---

## (c) The KloelGraphNode shape (already exists — do not change)

```ts
interface KloelGraphNode {
  id: string;
  label: string;
  parentId: string | null;
  route: string;        // the Next.js route the overlay renders
  // position/angle/radius computed by layout — do not hand-set
}
```

Entity nodes mirror `buildKloelGraphProductNodes`: one node per real row,
`parentId` = the galaxy sun, `route` = the canonical screen.

---

## (d) Route round-trip (S9 owns the resolver)

Until S9 lands, **galaxies emit ONLY plain-branch routes** (no entity query
param). Entity-node route == plain branch route — no resolver change needed for
the common case. When a drilldown IS required, the galaxy ships the plain-branch
route first and **lists the intended query param in its receipt**
(`?conversation=`, `?contact=`, `?deal=`, `?campaign=`, `?areaId=`, `?productId=`,
`?affiliateId=`). After S9 lands, a follow-up swaps to the query route.

S9 extends `resolveKloelGraphNodeForPathFromNodes` mirroring the
products/checkout branch, and adds a **fallback to the plain-branch route** when
the entity branch does not yet resolve — so the overlay highlight/label is never
wrong during the window. The `anuncios` branch is coupled to S6's recorded
option (proxy vs repoint).

---

## (e) Per-galaxy hook → builder → node mapping

| Galaxy | Real hook(s) | Node kind |
|---|---|---|
| S2 Perfil | `useDashboardHome` | metric/perfil (optional) |
| S3 Afiliar | `useAffiliates`, `usePartnerships` | marketplace-product + partner entity |
| S4 Criar | `buildKloelGraphProductNodes` (exists) | product entity (verify only) |
| S5 Educar | `useMemberAreas`, `useMemberAreaStats` | member-area entity |
| S6 Conversar | `conversations`, `useCRM`, `useAnuncios` | conversation/contact/deal/campaign/anuncio |
| S7 Consultar | wallet, analytics, reports | verify wired; optional adapter |

---

## (f) Honest-state rule (non-negotiable)

Every builder distinguishes:
- **loading** → emit `[]` (no skeleton nodes)
- **empty** (200, zero rows) → emit `[]`
- **error** (4xx/5xx/throw) → emit `[]` (never seed, never fake; never let the
  throw propagate to the Shell)

The galaxy sun node itself is always present (static). Only its **entity
children** are data-driven. A builder whose hook hits a 404 endpoint (e.g.
`useAnuncios` → `/api/anuncios/status` before S6's proxy exists) MUST yield
zero entity nodes, not throw and not seed.

---

## (g) Files each galaxy may touch (disjoint)

| Galaxy | May EDIT (body of its S0-created stub / own domain) | May CREATE | NEVER touch |
|---|---|---|---|
| S2 | conta/home/settings own files; body of adapters/dashboardMetricNodes.ts | adapters/ dir (designated creator) | Shell/Overlay/Prototype |
| S3 | body of KloelGraph.affiliate-nodes.ts; its .spec | KloelGraph.affiliate-nodes.spec.ts | Shell/Prototype/marketplace.ts |
| S4 | product nerve tabs (if mock) | graph-contract spec | product-nodes.ts/Shell |
| S5 | body of educar-graph-adapter.ts; its .spec | educar-graph-adapter.spec.ts | Shell/Overlay/Prototype |
| S6 | body of KloelGraph.conversar-nodes.ts; its .spec | conversar-nodes.spec.ts + /api/anuncios proxy | Shell/MainAppLayout/Prototype |
| S7 | carteira/analytics (if fake); body of optional adapter | adapters/consultar-nodes.ts (opt; dir created by S2) | Shell/Overlay/Prototype |

`graph/adapters/` directory is created ONCE by **S2** (designated owner per
pre-flight gate §H.3). S7 only adds a file under it; `atomic_create_file` is
idempotent so this is collision-free.

---

## (h) Verification contract (S11)

S11 runs the full gate (tsc/eslint/jest/vitest), Chrome E2E per galaxy with the
**4 honest states (loading/empty/error/success) verified per galaxy screen** in
the 80% overlay (not only the real screen render): real data + honest states +
back/forward + `?graph=1` + no 404 incl `/api/anuncios/*`, PULSE clean. If the
local stack will not boot, S11 marks **EXTERNAL_BLOCKED** with the documented
substitute verification (unit + graphNodes byte snapshot + PULSE + network
200/404 count) — never green by un-run E2E. Updates canonical map + acceptance
checklist with evidence.

---

## (i) Byte-identical render contract (S0 gate, base of all of Phase 1)

`graphNodes` must render **byte-identical** after the seam. The gate is a STRONG
spec, not a length/count check:

1. The array ORDER above (§a) is **frozen law**:
   `KLOEL_GRAPH_NODES → productNodes → affiliateNodes → educarNodes →
   conversarNodes → consultarNodes → perfilMetricNodes`. Order is part of the
   z-order / edge-build contract.
2. The snapshot serializes, for EACH node, `{ id, parentId, route, position,
   label, badge? }` — not the count.
3. S0 leaves a **registry-assembled spec** (snapshot of the serialized
   `graphNodes` array with a product fixture) that **each galaxy extends** when
   it registers its source — so an integration regression between galaxies is
   caught in Phase 1, not only at S11.
4. The split target is pre-named: if the Shell exceeds the 400-line arch guard,
   move the source-assembly into `KloelGraph.node-sources.ts` (already created),
   NEVER the open/close or layout logic.

---

*End WIRING_CONTRACT.md*

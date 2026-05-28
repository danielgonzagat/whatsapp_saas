# CRM Pipeline Wiring Audit (Claude-W5)

**Date**: 2026-05-28
**Branch**: `chore/canonicalization-helpers-mega-pr-2026-05-28`
**Scope**: End-to-end audit of `CRMPipelineView` frontend through `/crm/*` and
`/pipeline/*` backend endpoints. Verify every API method the frontend calls
has a real backend endpoint backed by real Prisma queries with workspace
isolation, and check spec coverage.

## TL;DR

The CRM module is **production-grade for the read+create+move kanban flow**.
Every API call that `CRMPipelineView` and its children make is wired to a real
NestJS controller that delegates to a real Prisma-backed service with strict
workspace isolation. Controller + service jest specs pass (66/66 tests across
7 spec suites, ~7.7s).

There are **no stub or empty-array handlers** in the backend `crm` or
`pipeline` modules. The single `return []` in `neuro-crm.service.helpers.ts:164`
is a legitimate empty-input guard inside the deterministic KMeans clustering
routine, not a stub.

There is **one frontend gap**: `DealDetailModal.tsx` is currently read-only.
The backend update/delete endpoints are wired and the frontend API client and
SWR mutations expose `updateDeal` / `deleteDeal`, but no UI affordance calls
them. This is a UX completeness gap, not a wiring defect. Per CLAUDE.md
"REGRA DE NÃO-INVENÇÃO", this audit documents the gap rather than inventing
edit/delete buttons without a UX spec.

## Inventory

### Frontend entry points

- `frontend/src/components/kloel/crm/CRMPipelineView.tsx` — kanban shell
- `frontend/src/components/kloel/vendas/PipelineTab.tsx:1,12,76` — only caller
  of `CRMPipelineView` (mounted under `vendas/pipeline`)
- `frontend/src/app/(main)/vendas/pipeline/page.tsx` — Next.js route
- `frontend/src/components/kloel/crm/PipelineStageColumn.tsx`
- `frontend/src/components/kloel/crm/PipelineToolbar.tsx`
- `frontend/src/components/kloel/crm/DealCard.tsx`
- `frontend/src/components/kloel/crm/DealCreateInlineForm.tsx`
- `frontend/src/components/kloel/crm/DealDetailModal.tsx` (read-only — gap)
- `frontend/src/components/kloel/crm/NoPipelinesEmptyState.tsx`
- `frontend/src/components/kloel/crm/ContactNeuroSection.tsx` (NeuroCRM panel)

### Frontend API layer

- `frontend/src/lib/api/crm.ts` — `crmApi`, `neuroCrmApi`, `segmentationApi`
- `frontend/src/lib/api/pipeline.ts` — alt sales pipeline client
- `frontend/src/hooks/useCRM.ts` — SWR hooks + mutations
- `frontend/src/hooks/useSalesPipeline.ts` — alt sales pipeline hook

### Backend modules

- `backend/src/crm/crm.module.ts` (CrmController + NeuroCrmController)
- `backend/src/crm/crm.controller.ts`
- `backend/src/crm/crm.service.ts`
- `backend/src/crm/crm.deals.helpers.ts` (pipeline/deal helpers)
- `backend/src/crm/neuro-crm.controller.ts`
- `backend/src/crm/neuro-crm.service.ts`
- `backend/src/crm/neuro-crm.service.helpers.ts`
- `backend/src/pipeline/pipeline.module.ts`
- `backend/src/pipeline/pipeline.controller.ts`
- `backend/src/pipeline/pipeline.service.ts`

## Endpoint Matrix

Each row maps a frontend call site to the backend route, service, and the
Prisma table(s) touched. All routes are gated by `JwtAuthGuard` +
`WorkspaceGuard` and resolve `workspaceId` via `resolveWorkspaceId(req, ...)`.

| Frontend call (file:line) | HTTP route | Backend handler | Prisma surface | Workspace-isolated? | Spec? |
|---|---|---|---|---|---|
| `useCRM.usePipelines` (`useCRM.ts:63`) → `crmApi.listPipelines` (`crm.ts:165`) | `GET /crm/pipelines` | `CrmController.listPipelines` → `CrmService.listPipelines` → `listPipelinesHelper` (`crm.deals.helpers.ts:28`) | `pipeline.findMany` `where: { workspaceId }`; auto-creates `Pipeline de Vendas` if none | YES | YES (`crm.service.spec.ts`, `crm.controller.spec.ts`) |
| `useCRM.useDeals` (`useCRM.ts:69`) → `crmApi.listDeals` (`crm.ts:179`) | `GET /crm/deals?pipeline=&stage=&search=` | `CrmController.listDeals` → `CrmService.listDeals` → `listDealsHelper` (`crm.deals.helpers.ts:390`) | `deal.findMany` `where: { stage: { pipeline: { workspaceId, ... } } }` | YES (nested through stage→pipeline.workspaceId) | YES |
| `useCRMMutations.createDeal` (`useCRM.ts:124`) → `crmApi.createDeal` (`crm.ts:188`) | `POST /crm/deals` | `CrmController.createDeal` → `CrmService.createDeal` → `createDealHelper` (`crm.deals.helpers.ts:47`) | `stage.findUnique` (verifies `pipeline.workspaceId === workspaceId`), `contact.findUnique`/`upsert` (verifies `contact.workspaceId === workspaceId`), `deal.create` | YES (Forbidden if cross-workspace) | YES |
| `useCRMMutations.moveDeal` (`useCRM.ts:129`) → `crmApi.moveDeal` (`crm.ts:202`) | `PUT /crm/deals/:id/move` | `CrmController.moveDeal` → `CrmService.moveDeal` → `moveDealHelper` (`crm.deals.helpers.ts:294`) | `deal.findUnique` + `stage.findUnique`, triple workspace check, `deal.update`, emits `stageChanged`/`dealWon`/`dealLost`; auto-tags `cliente` on `fechado` | YES | YES |
| `useCRMMutations.updateDeal` (`useCRM.ts:134`) → `crmApi.updateDeal` (`crm.ts:211`) | `PUT /crm/deals/:id` | `CrmController.updateDeal` → `CrmService.updateDeal` → `updateDealHelper` (`crm.deals.helpers.ts:165`) | `deal.findUnique` (verifies stage.pipeline.workspaceId), `deal.update`, on `WON` writes `autopilotEvent` + revenue webhook | YES | YES |
| `useCRMMutations.deleteDeal` (`useCRM.ts:139`) → `crmApi.deleteDeal` (`crm.ts:227`) | `DELETE /crm/deals/:id` | `CrmController.deleteDeal` → `CrmService.deleteDeal` → `deleteDealHelper` (`crm.deals.helpers.ts:229`) | `deal.findUnique` (workspace check), `auditService.log`, `deal.delete` | YES | YES |
| `useCRMMutations.createPipeline` (`useCRM.ts:119`) → `crmApi.createPipeline` (`crm.ts:167`) | `POST /crm/pipelines` | `CrmController.createPipeline` → `CrmService.createPipeline` → `createPipelineHelper` (`crm.deals.helpers.ts:11`) | `pipeline.create` with seeded stages (`Lead`/`Em Negociação`/`Fechado`) | YES (connects workspace by id) | YES |
| `crmApi.listContacts` (`crm.ts:113`) / `useContacts` (`useCRM.ts:30`) | `GET /crm/contacts` | `CrmController.listContacts` → `CrmService.listContacts` | `contact.count` + `contact.findMany` `where: { workspaceId, ... }` | YES | YES |
| `crmApi.createContact` (`crm.ts:131`) / `useCRMMutations.createContact` | `POST /crm/contacts` | `CrmController.createContact` → `CrmService.createContact` | `contact.create` with `workspace.connect` | YES | YES |
| `useCRMMutations.upsertContact` (`useCRM.ts:101`) | `POST /crm/contacts/upsert` | `CrmController.upsertContact` → `CrmService.upsertContact` | `contact.upsert` on `workspaceId_phone` composite key | YES | YES |
| `useContact` (`useCRM.ts:52`) / `crmApi.getContact` (`crm.ts:176`) | `GET /crm/contacts/:phone` | `CrmController.getContact` → `CrmService.getContact` | `contact.findUnique` on `workspaceId_phone` with `tags` + `deals` (with `stage` summary) included | YES | YES |
| `crmApi.addTag` (`crm.ts:145`) / `useCRMMutations.addTag` | `POST /crm/contacts/:phone/tags` | `CrmController.addTag` → `CrmService.addTag` | `$transaction`: `tag.upsert` on `workspaceId_name`, then `contact.update` to connect tag | YES | YES |
| `crmApi.removeTag` (`crm.ts:154`) / `useCRMMutations.removeTag` | `DELETE /crm/contacts/:phone/tags/:tag` | `CrmController.removeTag` → `CrmService.removeTag` | `tag.findUnique` then `contact.update` to disconnect | YES | YES |
| `neuroCrmApi.analyze` (`crm.ts:293`) | `POST /crm/neuro/analyze/:contactId` | `NeuroCrmController.analyze` → `NeuroCrmService.analyzeContact` | `contact.findFirst({ where: { id, workspaceId } })` + OpenAI call + `contact.updateMany` to persist score/sentiment | YES (`findFirst` enforces workspace) | YES (`neuro-crm.service.spec.ts`, `neuro-crm.controller.spec.ts`) |
| `neuroCrmApi.nextBestAction` (`crm.ts:304`) / `ContactNeuroSection` | `GET /crm/neuro/next-best/:contactId` | `NeuroCrmController.nba` → `NeuroCrmService.nextBestAction` | `contact.findFirst({ where: { id, workspaceId } })` with last 3 messages | YES | YES |
| `neuroCrmApi.clusters` (`crm.ts:307`) | `GET /crm/neuro/clusters` | `NeuroCrmController.clusters` → `NeuroCrmService.clusterLeads` | `contact.findMany({ where: { workspaceId } })` take 500 + deterministic KMeans | YES | YES |
| `neuroCrmApi.simulate` (`crm.ts:309`) | `POST /crm/neuro/simulate` | `NeuroCrmController.simulate` → `NeuroCrmService.simulateConversation` | OpenAI only (no Prisma write); returns `unavailable` when `OPENAI_API_KEY` is missing | N/A (no workspace data write) | YES |
| `useSalesPipeline` (`useSalesPipeline.ts:48`) — uses `/crm/pipelines` + `/crm/deals` | (same as above) | (same as above) | (same as above) | YES | YES |
| `getSalesPipeline` (`pipeline.ts:63`) | `GET /pipeline` | `PipelineController.getPipeline` → `PipelineService.getPipeline` | `pipeline.findFirst({ where: { workspaceId } })`, auto-creates default `Sales Pipeline` with stages `Lead/Contacted/Proposal/Won/Lost` | YES | YES (`pipeline.service.spec.ts`, `pipeline.controller.spec.ts`) |
| `createSalesDeal` (`pipeline.ts:82`) | `POST /pipeline/deals` | `PipelineController.createDeal` → `PipelineService.createDeal` | Verifies `contact.workspaceId === workspaceId`, `deal.create` on first stage | YES | YES |
| `moveSalesDeal` (`pipeline.ts:95`) | `PUT /pipeline/deals/:id/stage` | `PipelineController.updateStage` → `PipelineService.updateDealStage` | Triple workspace check on deal + stage, `deal.update` | YES | YES |

All endpoints in the matrix return real Prisma data; no handler returns
hardcoded `[]`, `{ ok: true }`, or `null` placeholders.

## Findings

### F1 — DealDetailModal is read-only (frontend UX gap)

**File**: `frontend/src/components/kloel/crm/DealDetailModal.tsx:23-138`

The modal renders `title`, `value`, `priority`, `stage`, `contact`,
`description`, `expectedCloseDate`, `createdAt`, `notes` — all read-only.
There is no Edit, Delete, Save, or stage-change button.

The backend supports both `PUT /crm/deals/:id` and `DELETE /crm/deals/:id`
with full workspace isolation, and the frontend `useCRMMutations` hook
(`frontend/src/hooks/useCRM.ts:134,139`) already exposes `updateDeal` and
`deleteDeal`. They are simply not called anywhere in the UI.

**Severity**: UX completeness gap, not a wiring defect. Tagged for a future
plan that includes a real UX spec (label text, confirmation flow, tone of
the destructive action). Inventing edit/delete buttons here would violate
CLAUDE.md "REGRA DE NÃO-INVENÇÃO" and "REGRA DE FRONTEND" (no buttons
without a real handler tied to an existing intent).

**Recommended follow-up plan**: open a separate plan
`crm-deal-detail-edit-delete` that:

1. Specifies the UX (header dropdown vs. footer buttons; modal confirmation
   for delete).
2. Wires Edit mode that toggles title/value/status fields into form inputs.
3. Calls `useCRMMutations.updateDeal` and `useCRMMutations.deleteDeal`.
4. Adds a Playwright/component test for both flows.

### F2 — Two parallel pipeline surfaces

There are **two backend pipeline modules**:

1. `backend/src/crm/*` — `CrmController` exposes `/crm/pipelines` and
   `/crm/deals*`. This is what `CRMPipelineView` and `useSalesPipeline`
   currently consume.
2. `backend/src/pipeline/*` — `PipelineController` exposes `/pipeline` and
   `/pipeline/deals*`. This is what `frontend/src/lib/api/pipeline.ts`
   (`getSalesPipeline`/`createSalesDeal`/`moveSalesDeal`) consumes.

Both are real and workspace-isolated, but they auto-create different default
seed stages:

- `/crm/pipelines` default seed: `Lead` / `Em Negociação` / `Fechado`
  (`crm.deals.helpers.ts:18-21`).
- `/pipeline` default seed: `Lead` / `Contacted` / `Proposal` / `Won` /
  `Lost` (`pipeline.service.ts:43-47`).

If a workspace hits both routes before having a pipeline, it ends up with
two parallel pipelines with mismatched stage vocabularies.

**Search shows the `/pipeline` API is not called by any current page**
(`useSalesPipelineMutations` is exported but unused as of this audit). Still,
this is a latent divergence — anyone who later wires a `vendas/` page through
`getSalesPipeline()` will get a second default pipeline created.

**Severity**: latent inconsistency. Not a wiring defect today.

**Recommended follow-up**: pick one surface (the `/crm` family is the one in
use). Either deprecate `PipelineController` or have `PipelineService` reuse
`CrmService.listPipelines` semantics so the seed stays canonical.

### F3 — `admin-pipeline` is a separate admin surface

`backend/src/admin/pipeline/admin-pipeline.controller.ts` exists and is
distinct from the customer-facing pipeline. It is correctly scoped under
`/admin/*` and not consumed by `CRMPipelineView`. No action required.

### F4 — `return []` in `neuro-crm.service.helpers.ts:164` is NOT a stub

Line 164 is a legitimate empty-input guard inside `runKMeans` — when the
input projection list is empty, return zero centroids. The unit test
`neuro-crm.service.helpers.spec.ts` covers it. Flagged here only because a
text scan for empty-array returns hits it.

## Workspace-isolation verification

Every Prisma query reviewed in the matrix above filters by `workspaceId`
either directly (`where: { workspaceId }`), via a composite unique
constraint (`workspaceId_phone`, `workspaceId_name`), or transitively
through `stage.pipeline.workspaceId`. Helper functions that mutate cross-
workspace data throw `ForbiddenException` explicitly:

- `crm.deals.helpers.ts:71` (createDeal — stage workspace check)
- `crm.deals.helpers.ts:107` (createDeal — contact workspace check)
- `crm.deals.helpers.ts:185` (updateDeal)
- `crm.deals.helpers.ts:246` (deleteDeal)
- `crm.deals.helpers.ts:322` (moveDeal triple check)
- `pipeline.service.ts:95` (updateDealStage)
- `pipeline.service.ts:127` (createDeal contact ownership)

No bypass paths observed.

## Spec coverage

```text
backend/src/crm/crm.controller.spec.ts            PASS
backend/src/crm/crm.service.spec.ts               PASS
backend/src/crm/neuro-crm.controller.spec.ts      PASS
backend/src/crm/neuro-crm.service.spec.ts         PASS
backend/src/crm/neuro-crm.service.helpers.spec.ts PASS
backend/src/pipeline/pipeline.controller.spec.ts  PASS
backend/src/pipeline/pipeline.service.spec.ts     PASS
```

7 suites, 66 tests, 7.752 s (Claude-W5, 2026-05-28).

## NOT-yet-wired endpoints (follow-up backlog)

These are exposed by the backend with real Prisma logic + workspace
isolation but are not currently called by any production frontend component
or page. They are NOT defects in the audited scope, just opportunities for
future feature work that already has a real motor under it.

| Endpoint | Backend status | Frontend status |
|---|---|---|
| `PUT /crm/deals/:id` (update) | Production-ready (`crm.deals.helpers.ts:165`) | `crmApi.updateDeal` exists (`crm.ts:211`), no UI caller |
| `DELETE /crm/deals/:id` | Production-ready (`crm.deals.helpers.ts:229`) | `crmApi.deleteDeal` exists (`crm.ts:227`), no UI caller |
| `POST /crm/neuro/analyze/:contactId` | Production-ready (OpenAI + persist) | `neuroCrmApi.analyze` exists (`crm.ts:293`), not called — `ContactNeuroSection` only calls `nextBestAction` |
| `POST /crm/neuro/simulate` | Production-ready (graceful `unavailable` when `OPENAI_API_KEY` missing) | `neuroCrmApi.simulate` exists (`crm.ts:309`), no UI caller |
| `GET /crm/neuro/clusters` | Production-ready (`clusterLeads`) | `neuroCrmApi.clusters` exists (`crm.ts:307`), no UI caller |
| `GET /pipeline` family (`/pipeline`, `POST /pipeline/deals`, `PUT /pipeline/deals/:id/stage`) | Production-ready (see F2) | `lib/api/pipeline.ts` exists, no UI caller — `useSalesPipeline` actually targets `/crm/pipelines` |

## Verdict

`CRMPipelineView` is **wired end-to-end through real Prisma with workspace
isolation, full spec coverage, and zero stub handlers**. The CLAUDE.md
classification of CRM at "~80%" is conservative for the audited surface;
for the kanban list+create+move flow it is effectively 100%. The remaining
20% is a UX gap (DealDetailModal edit/delete affordance) and an architectural
consolidation opportunity (F2 — two pipeline surfaces), neither of which is
a wiring defect.

No code change committed in this pass — read-only audit per scope.

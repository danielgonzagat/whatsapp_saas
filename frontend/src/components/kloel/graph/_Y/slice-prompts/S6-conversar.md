# SLICE S6 — Galaxy Conversar (PARALLEL after S0)

## Escopo
Two layers: (1) DATA in `buildConversarNodesEdges@604` (keep `(conversar)=>{nodes,edges}`
contract; feed from real hooks, honest-empty); (2) PANEL swaps — replace each inline
panel body with the real component. High feasibility; most real surfaces self-fetch.

## Arquivos (writes — DISJOINT)
- `domains/conversar/conversar.jsx` (branches/modules/maps + `buildConversarNodesEdges`
  + panel-mount wrappers)
- `domains/conversar/conversar.data.ts` (adapter: `useCRM`/`useSalesPipeline`/`useSales`/
  `useAnuncios`/`useConversationHistory` → honest-empty shape)
- `domains/conversar/screens.ts` (SCREEN_BY_TYPE: crm/contact/order/vendas/adCampaign/
  conversation/autopilot)

## Reads-only
`CRMPipelineView.tsx`, `ContactDetailDrawer.tsx`, `InboxWorkspace.tsx`/`ConversationsView.tsx`,
`VendasView.tsx`, `AnunciosView.tsx`, `AutopilotDecisionLog.tsx`, marketing
`ChannelOnboarding.tsx`, `useCRM/useSalesPipeline/useSales/useAnuncios/useConversationHistory`.

## Node → data
Feed builder from adapter; loading/empty/error → [] per slice → `cv-crm` + active
`CRM_MODULES` only. NEVER `*_SEED`. Note: `AUTOPILOT_EVENTS_SEED`/`FOLLOWUPS_SEED`/
`AD_RULES_SEED`/`CRM_SEED` feed PANELS directly — repoint panel bodies too, not just
the builder.

## Overlay → component (verify props first)
crm→`CRMPipelineView` (no props); contact→`ContactDetailDrawer({phone,onClose})`
(contactId→phone); conversation→`InboxWorkspace(props)` or `ConversationsView` (no props);
order/vendas→`VendasView({defaultTab?})`; autopilot→`AutopilotDecisionLog(props)`;
adCampaign→`AnunciosView({defaultTab?})`; ChannelOnboardingWizard→marketing `ChannelOnboarding`.

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on `domains/conversar/*`.
2. Read prop shapes for `InboxWorkspaceProps@25` + `AutopilotDecisionLog@93` (others
   confirmed). Verify `/api/anuncios/*` returns data; if 404/empty → AnunciosView
   renders setup-required (its honest path), not seed.
3. Map seed keys→DTO in adapter; swap panel bodies (keep chrome).
4. honest-empty; byte-identity gate + tsc/eslint/vitest.
5. release + small commit.

## Stop conditions
`/api/anuncios/*` live-empty AND no setup-required path · prop shapes unread ·
DECISÃO unresolved.

---
@import _PLAYBOOK.md

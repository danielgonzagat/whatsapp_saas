# SLICE S4 — Galaxy Afiliar (PARALLEL after S0)

## Escopo
Wire the afiliar slice (`sun-afiliar`). Two shapes depending on DECISÃO:
**A (route-based)** = afiliar nodes already route to real screens; verify honest-empty
+ tune `static-nodes.ts` tuples (near-trivial). **B (state-based)** = resurrect the
prototype's seed-driven type-switch: builder-consumer state + `SCREEN_BY_TYPE` entries.

## Arquivos (writes — DISJOINT)
- `domains/afiliar/afiliar.tsx` (re-export `buildAffiliateNodesEdges@368` +
  `AFFILIATE_BRANCHES@337` + node.type→component switch)
- `domains/afiliar/afiliar.data.ts` (adapter: `useAffiliates`/`useAffiliateStats`/
  `useAffiliateDetail`/`usePartnerChatContacts`/`affiliateApi` marketplace → honest-empty
  {loading,empty,error,marketplace,myAffiliates,partnerChats})
- `domains/afiliar/screens.ts` (SCREEN_BY_TYPE: affProduct/affPartner/affBranch)

## Reads-only
`ProdutosAfiliarSeTab.tsx`+`ProdutosView.tsx`, `ParceriasShell.tsx`,
`AffiliateDetailSheet.tsx`, `AffiliateProductDetail.tsx`, `usePartnerships.ts`,
`lib/api/affiliate.ts` (re-read marketplace method name — was unread).

## Node → data
Keep `AFFILIATE_BRANCHES` (4 static). Retire `MARKETPLACE_SEED@357`/`MY_AFFILIATES_SEED@344`/
`PARTNER_CHATS_SEED@349`. marketplace←`affiliateApi` (NOT `marketplaceApi.listMarketplaceTemplates`
— that's flow templates, WRONG). loading/empty/error→[] (4 branches remain).

## Overlay → component
`affProduct`→`AffiliateProductDetail({item,onBack,requestingId,copiedAffiliate,
onRequestAffiliation,onCopyLink})`; `affPartner`→`AffiliateDetailSheet({affiliate:
useAffiliateDetail(meta.affId).data,onClose,onChat,onRevoke})`; `affBranch`→
`ProdutosView`/`AfiliarSe` grid or `ParceriasShell({defaultTab:'afiliados'})`.

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on `domains/afiliar/*`.
2. Re-read `lib/api/affiliate.ts` marketplace method (transient mute earlier).
3. Map seed keys→DTO in the adapter (keep builder pure):
   MARKETPLACE_SEED↔MarketplaceItem/AffiliateProduct; MY_AFFILIATES_SEED↔Affiliate
   (partnerName/type/status/totalSales).
4. honest-empty; delete the 3 entity seeds AFTER all consumers repointed.
5. Byte-identity gate + tsc/eslint/vitest; smoke each afiliar node.
6. release + small commit.

## Stop conditions
`affiliateApi` marketplace method unread/ambiguous · backend marketplace
workspace-scope just changed (pin to controller method names, not response internals) ·
DECISÃO unresolved.

---
@import _PLAYBOOK.md

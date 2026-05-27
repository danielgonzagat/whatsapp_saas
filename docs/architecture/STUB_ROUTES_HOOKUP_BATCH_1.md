# Stub Route Hookup — Batch 1 Audit

> **Generated:** 2026-05-26
> **Scope:** 15 highest-value stub candidates from the stub-route inventory
> **Finding:** **0 new hookups required.** All 15 candidates are already crystallized or are intentional redirects. Prior crystallization waves resolved these stubs before this analysis.

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Already crystallized (real component render) | 13 |
| ⚠️ Intentional redirect (documented design decision) | 2 |
| ❌ Blocked / needs new hookup | 0 |

---

## Candidate-by-Candidate Audit

### #1: `/carteira` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/carteira/page.tsx:1-4`
- **Stub?** No — renders `<KloelCarteira defaultTab="saldo" />` (real component, not a stub)
- **Component:** `frontend/src/components/kloel/carteira.tsx` — 236-line tabbed wallet shell
- **Backend controller:** `backend/src/wallet/prepaid-wallet.controller.ts:27` — `@Controller('wallet/prepaid')`
- **Backend kloel wallet:** `backend/src/kloel/wallet.service.ts` (24.3KB) — balance, transactions, chart, monthly, withdrawals, anticipations via `/kloel/wallet/:wsId/*`
- **API client:** `frontend/src/lib/api/wallet.ts:8-81` — `getWalletBalance()`, `getWalletTransactions()`, `requestWithdrawal()`, `processSale()`, `confirmTransaction()`
- **SWR hooks (all in `frontend/src/hooks/useWallet.ts`):**
  - `useWalletBalance()` (line 68) → `GET /kloel/wallet/{wsId}/balance`
  - `useWalletTransactions()` (line 110) → `GET /kloel/wallet/{wsId}/transactions`
  - `useWalletChart()` (line 124)
  - `useWalletMonthly()` (line 136)
  - `useWalletWithdrawals()` (line 153)
  - `useWalletAnticipations()` (line 202)
  - `useBankAccounts()` (line 171)
- **Verdict:** Full stack complete. No hookup needed.

---

### #2: `/carteira/saldo` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/carteira/saldo/page.tsx:1-5`
- **Stub?** No — renders `<KloelCarteira defaultTab="saldo" />`
- **Component:** Same `KloelCarteira` as #1. Renders `CarteiraSaldoCard` sub-component (`frontend/src/components/kloel/carteira/CarteiraSaldoCard.tsx` — 7.5KB, with revenue chart and recent transactions)
- **Backend endpoint:** `GET /kloel/wallet/{wsId}/balance` (`backend/src/kloel/wallet.service.ts`)
- **API client:** `frontend/src/lib/api/wallet.ts:getWalletBalance()`
- **SWR hook:** `frontend/src/hooks/useWallet.ts:68` — `useWalletBalance()`
- **Verdict:** Full stack complete. No hookup needed.

---

### #3: `/carteira/extrato` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/carteira/extrato/page.tsx:1-5`
- **Stub?** No — renders `<KloelCarteira defaultTab="extrato" />`
- **Component:** Same `KloelCarteira`. Renders `CarteiraExtratoTable` sub-component (`frontend/src/components/kloel/carteira/CarteiraExtratoTable.tsx` — 8.9KB, with filtering, pagination)
- **Backend endpoint:** `GET /kloel/wallet/{wsId}/transactions` (`backend/src/kloel/wallet.service.ts`)
- **API client:** `frontend/src/lib/api/wallet.ts:getWalletTransactions()`
- **SWR hook:** `frontend/src/hooks/useWallet.ts:110` — `useWalletTransactions()`
- **Verdict:** Full stack complete. No hookup needed.

---

### #4: `/carteira/saques` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/carteira/saques/page.tsx:1-5`
- **Stub?** No — renders `<KloelCarteira defaultTab="saques" />`
- **Component:** Same `KloelCarteira`. Renders `CarteiraSaque` (`frontend/src/components/kloel/carteira/CarteiraSaque.tsx` — 11.3KB) and `CarteiraWithdrawModal` (`frontend/src/components/kloel/carteira/CarteiraWithdrawModal.tsx` — 12.7KB)
- **Backend endpoint:** `POST wallet/prepaid/withdraw` (`backend/src/wallet/prepaid-wallet.controller.ts`)
- **API client:** `frontend/src/lib/api/wallet.ts:requestWithdrawal()`
- **SWR hooks:** `useWalletWithdrawals()` (line 153), `useBankAccounts()` (line 171) — both in `frontend/src/hooks/useWallet.ts`
- **Verdict:** Full stack complete. No hookup needed.

---

### #5: `/carteira/antecipacoes` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/carteira/antecipacoes/page.tsx:1-5`
- **Stub?** No — renders `<KloelCarteira defaultTab="antecipacoes" />`
- **Component:** Same `KloelCarteira`. Renders `CarteiraAntecipateModal` (`frontend/src/components/kloel/carteira/CarteiraAntecipateModal.tsx` — 4.3KB)
- **Backend endpoint:** `GET /kloel/wallet/{wsId}/anticipations` (`backend/src/kloel/wallet.service.ts`)
- **API client:** Direct `apiFetch` in `useWalletAnticipations` at `frontend/src/hooks/useWallet.ts:202`
- **SWR hook:** `useWalletAnticipations()` (line 202) — `frontend/src/hooks/useWallet.ts`
- **Verdict:** Full stack complete. No hookup needed.

---

### #6: `/carteira/movimentacoes` — ⚠️ INTENTIONAL REDIRECT

- **Page file:** `frontend/src/app/(main)/carteira/movimentacoes/page.tsx:1-6`
- **Stub LOC:** 2 (redirect-only) — `redirect('/carteira/saldo')`
- **Criterion check:** FAILS criterion #4 — this IS a redirect-only stub. However, it is an intentional UX decision, not a missing feature.
- **Backend:** No standalone `/carteira/movimentacoes` endpoint. All movements are served inline within the balance view at `GET /kloel/wallet/{wsId}/transactions` and rendered in the `saldo` tab's `CarteiraSaldoCard`.
- **Blocked reason:** Creating a standalone page would duplicate the `saldo` tab's transaction listing. The redirect is architecturally correct — there is no distinct "movimentacoes" concept separate from the wallet balance view.

---

### #7: `/marketing/whatsapp` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/marketing/whatsapp/page.tsx:1-5`
- **Stub?** No — renders `<MarketingView defaultTab="whatsapp" />`
- **Component:** `frontend/src/components/kloel/marketing/MarketingView.tsx` (71 lines) — thin channel-shell delegating to channel-specific tabs (`OfficialMarketingChannelPage/`)
- **Backend controller:** `backend/src/marketing/marketing.controller.ts:42` — `@Controller('marketing')`
  - `GET marketing/stats` (line 49)
  - `POST marketing/email/send`
  - WhatsApp via `backend/src/whatsapp/` (118 files)
  - Meta WhatsApp via `backend/src/meta/meta-whatsapp.service.ts` (18.9KB)
- **API client:** `frontend/src/lib/api/whatsapp.ts` (300 lines) — 28+ exported functions covering connection, messaging, catalog, screencast, session management, brain
- **SWR hook:** `frontend/src/components/kloel/marketing/MarketingView.ConnectionHook.tsx:15` — `useMarketingConnection()`
- **Verdict:** Full stack complete. No hookup needed.

---

### #8: `/marketing/email` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/marketing/email/page.tsx:1-5`
- **Stub?** No — renders `<MarketingView defaultTab="email" />`
- **Component:** Same `MarketingView` → delegates to email channel tab
- **Backend:** `backend/src/marketing/marketing.controller.ts` — `POST marketing/email/send`, `GET marketing/connect/email/status`
- **API client:** Inline via `apiFetch` in `useEmailMarketing` hook
- **SWR hook:** `frontend/src/components/kloel/marketing/useEmailMarketing.ts:52` — `useEmailMarketing()`
  - SWR key: `/marketing/email/campaigns` (line 25)
  - Fetcher: `emailCampaignsFetcher()` (line 28)
- **Verdict:** Full stack complete. No hookup needed.

---

### #9: `/marketing/instagram` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/marketing/instagram/page.tsx:1-5`
- **Stub?** No — renders `<MarketingView defaultTab="instagram" />`
- **Component:** Same `MarketingView` → delegates to Instagram channel tab
- **Backend:** `backend/src/marketing/` — Instagram channel status via `GET marketing/connect/instagram/status`
- **API client:** `frontend/src/lib/api/meta.ts` (10.1KB) — IG account, post, insight data via Meta Graph API
- **SWR hook:** `frontend/src/components/kloel/marketing/useInstagramMarketing.ts:35` — `useInstagramMarketing()`
- **Verdict:** Full stack complete. No hookup needed.

---

### #10: `/marketing/facebook` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/marketing/facebook/page.tsx:1-5`
- **Stub?** No — renders `<MarketingView defaultTab="facebook" />`
- **Component:** Same `MarketingView` → delegates to Facebook channel tab
- **Backend:** `backend/src/marketing/` — Facebook/Messenger channel via `GET marketing/connect/facebook/status`
- **API client:** `frontend/src/lib/api/meta.ts` — Facebook page/insight data
- **SWR hook:** `frontend/src/components/kloel/marketing/useFacebookMarketing.ts:13` — `useFacebookMarketing()`
- **Verdict:** Full stack complete. No hookup needed.

---

### #11: `/marketing/tiktok` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/marketing/tiktok/page.tsx:1-5`
- **Stub?** No — renders `<MarketingView defaultTab="tiktok" />`
- **Component:** Same `MarketingView` → delegates to TikTok channel tab
- **Backend:** `backend/src/marketing/tiktok-marketing.controller.ts` (1.9KB), `backend/src/marketing/tiktok-marketing.service.ts` (16.7KB)
  - `GET marketing/connect/tiktok/status`
  - `POST marketing/tiktok/send`
- **SWR hook:** `frontend/src/components/kloel/marketing/useTikTokMarketing.ts:28` — `useTikTokMarketing()`
  - SWR key: `/marketing/connect/tiktok/status`
- **Verdict:** Full stack complete. No hookup needed.

---

### #12: `/parcerias` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/parcerias/page.tsx:1-4`
- **Stub?** No — renders `<ParceriasShell />`
- **Component:** `frontend/src/components/kloel/parcerias/ParceriasView.tsx:1-2` re-exports `ParceriasShell` (156 lines, `ParceriasShell.tsx`)
  - Tabs: `colaboradores`, `afiliados`, `chat`
  - Sub-components: `ColaboratorRoster`, `AffiliateDirectory`, `ChatContactList` + `ChatMessageArea`
- **Backend controller:** `backend/src/partnerships/partnerships.controller.ts:27` — `@Controller('partnerships')`
  - `GET partnerships/collaborators` (line 58)
  - `GET partnerships/collaborators/stats` (line 63)
  - `POST partnerships/collaborators/invite` (line 68)
  - `DELETE partnerships/collaborators/invite/:id` (line 74)
  - `PUT partnerships/collaborators/:agentId/role` (line 79)
  - `DELETE partnerships/collaborators/:agentId` (line 87)
  - `GET partnerships/affiliates` (line 91)
  - `GET partnerships/affiliates/stats` (line 103)
  - `GET partnerships/affiliates/:id` (line 109)
  - `POST partnerships/affiliates` (line 116)
  - `POST partnerships/affiliates/:id/approve` (line 124)
  - `POST partnerships/affiliates/:id/revoke` (line 130)
  - `GET partnerships/affiliates/:id/performance` (line 136)
- **Backend service:** `backend/src/partnerships/partnerships.service.ts` (15.3KB)
- **API client:** `frontend/src/lib/api/partnerships.ts` (129 lines) — `partnershipsApi` object
- **SWR hooks (all in `frontend/src/hooks/usePartnerships.ts` — 174 lines):**
  - `useCollaborators()` (line 87)
  - `useCollaboratorStats()` (line 95)
  - `useAffiliates()` (line 145) — SWR key: `/partnerships/affiliates?type=...&search=...`
  - `useAffiliateStats()` (line 153)
  - `useAffiliateDetail()` (line 161)
  - `usePartnerChatContacts()` (line 165)
  - `usePartnerMessages()` (line 169)
  - Mutation helpers: `inviteCollaborator()`, `revokeInvite()`, `updateCollaboratorRole()`, `removeCollaborator()`, `createAffiliate()`, `approveAffiliate()`, `revokeAffiliate()`, `sendPartnerMessage()`, `markPartnerAsRead()`
- **Verdict:** Full stack complete. No hookup needed.

---

### #13: `/parcerias/afiliados` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/parcerias/afiliados/page.tsx:1-5`
- **Stub?** No — renders `<ParceriasView defaultTab="afiliados" />`
- **Component:** Same `ParceriasView` (re-export of `ParceriasShell`) — renders `AffiliateDirectory` tab with `AffiliateSetupCards`, `AffiliateStatsSummary`, `AffiliateProfileCard`, `AffiliateRegistrationForm`, `AffiliateDetailSheet`
- **Backend:** Same as #12 — `GET partnerships/affiliates` etc.
- **API client:** `frontend/src/lib/api/affiliate.ts` (96 lines) — `affiliateApi` object: `getAffiliates()`, `createAffiliate()`, `getAffiliateProducts()`, `generateAffiliateLink()`
- **SWR hook:** `useAffiliates()` at `frontend/src/hooks/usePartnerships.ts:145`
- **Verdict:** Full stack complete. No hookup needed.

---

### #14: `/produtos` — ✅ CRYSTALLIZED

- **Page file:** `frontend/src/app/(main)/produtos/page.tsx:1-6`
- **Stub?** No — renders `<ProdutosView />`
- **Component:** `frontend/src/components/kloel/produtos/ProdutosView.tsx` (267 lines)
  - Tabs: `produtos` (`ProductsListing` — 11.6KB), `afiliar` (`ProdutosAfiliarSeTab` — 7.4KB), `membros` (`ProdutosAreaMembrosTab` — 15.9KB), `marketplace` (`MarketplaceProductGrid` — 5.5KB)
  - Filters: `ProductFilters` (2.2KB), `MarketplaceFilters` (2.7KB)
  - Actions: `ProductActions` (2.3KB), `ProductCardGrid` (12.1KB)
- **Backend product service:** `backend/src/products/product.service.ts` (329 lines) — full CRUD
- **Backend marketplace:** `backend/src/marketplace/marketplace.controller.ts:20` — `@Controller('marketplace')`
- **Backend member-area:** `backend/src/member-area/member-areas.controller.ts` (9.5KB), `member-enrollments.controller.ts` (8.3KB), `member-modules.controller.ts` (10.1KB), `member-structure.controller.ts` (7.6KB)
- **API client:** `frontend/src/lib/api/products.ts` (137 lines) — `productApi` and `knowledgeBaseApi` objects
- **SWR hooks:** Inline within `ProdutosView` and tab sub-components, using `apiFetch` + `useSWR`
- **Verdict:** Full stack complete. No hookup needed.

---

### #15: `/billing` — ⚠️ INTENTIONAL REDIRECT

- **Page file:** `frontend/src/app/(main)/billing/page.tsx:1-9`
- **Stub LOC:** 4 (redirect-only) — `redirect('/settings?section=billing')`
- **Source comment (lines 3–4):** `"Redirect kept intentionally — billing is managed inside the account settings page."`
- **Criterion check:** FAILS criterion #4 — redirect-only stub. But explicitly documented as intentional.
- **Backend:** `backend/src/billing/billing.controller.ts:36` — `@Controller('billing')`
  - `GET billing/subscription` (line 75)
  - `GET billing/usage` (line 83)
  - `POST billing/activate-trial` (line 89)
  - `POST billing/cancel` (line 97)
  - `POST billing/checkout` (line 105)
- **API client:** `frontend/src/lib/api/billing.ts` (94 lines) — `billingApi` object
- **Blocked reason:** Creating a standalone `/billing` page would duplicate functionality already served via the `ContaView` settings page (`frontend/src/components/kloel/conta/ContaView.tsx`) at `/settings?section=billing`. The backend endpoints are consumed by the settings UI. The redirect is correct by design.

---

## Blocked Candidates

| # | Route | Block Reason |
|---|-------|-------------|
| 6 | `/carteira/movimentacoes` | Intentional redirect to `/carteira/saldo`. No standalone backend endpoint — movements are inlined in the balance view. |
| 15 | `/billing` | Intentional redirect to `/settings?section=billing`. Billing UI lives inside account settings (`ContaView`). Backend endpoints exist but are consumed there. |

Both redirects carry explicit source-code comments documenting them as intentional design decisions.

---

## Execution Order — Already Shipped

All 13 crystallized pages follow the same architectural pattern: a 3–6 line server/client page component that imports a canonical view component and renders it with a `defaultTab` prop. `workspaceId` is auto-resolved via `useWorkspaceId()` inside SWR hooks — zero manual prop threading.

| # | Route | Import | Return |
|---|-------|--------|--------|
| 1 | `/carteira` | `import KloelCarteira from '@/components/kloel/carteira'` | `<KloelCarteira defaultTab="saldo" />` |
| 2 | `/carteira/saldo` | ↑ same | `<KloelCarteira defaultTab="saldo" />` |
| 3 | `/carteira/extrato` | ↑ same | `<KloelCarteira defaultTab="extrato" />` |
| 4 | `/carteira/saques` | ↑ same | `<KloelCarteira defaultTab="saques" />` |
| 5 | `/carteira/antecipacoes` | ↑ same | `<KloelCarteira defaultTab="antecipacoes" />` |
| 7 | `/marketing/whatsapp` | `import MarketingView from '@/components/kloel/marketing/MarketingView'` | `<MarketingView defaultTab="whatsapp" />` |
| 8 | `/marketing/email` | ↑ same | `<MarketingView defaultTab="email" />` |
| 9 | `/marketing/instagram` | ↑ same | `<MarketingView defaultTab="instagram" />` |
| 10 | `/marketing/facebook` | ↑ same | `<MarketingView defaultTab="facebook" />` |
| 11 | `/marketing/tiktok` | ↑ same | `<MarketingView defaultTab="tiktok" />` |
| 12 | `/parcerias` | `import ParceriasShell from '@/components/kloel/parcerias/ParceriasView'` | `<ParceriasShell />` |
| 13 | `/parcerias/afiliados` | `import ParceriasView from '@/components/kloel/parcerias/ParceriasView'` | `<ParceriasView defaultTab="afiliados" />` |
| 14 | `/produtos` | `import ProdutosView from '@/components/kloel/produtos/ProdutosView'` | `<ProdutosView />` |

### Component reuse density

- **5 pages** share `KloelCarteira` (`frontend/src/components/kloel/carteira.tsx`)
- **5 pages** share `MarketingView` (`frontend/src/components/kloel/marketing/MarketingView.tsx`)
- **2 pages** share `ParceriasView` / `ParceriasShell` (`frontend/src/components/kloel/parcerias/ParceriasView.tsx` → `ParceriasShell.tsx`)
- **1 page** uses `ProdutosView` (`frontend/src/components/kloel/produtos/ProdutosView.tsx`)

---

## Remaining Stub Candidates (for Batch 2)

The following pages in `(main)/` were identified as still-genuine stubs (redirect-only) after this audit:

| Route | Redirects to | File:line |
|-------|-------------|-----------|
| `/account` | `/settings` | `frontend/src/app/(main)/account/page.tsx:8` |
| `/canvas` | `/canvas/inicio` | `frontend/src/app/(main)/canvas/page.tsx:8` |
| `/marketing` | `/marketing/whatsapp` | `frontend/src/app/(main)/marketing/page.tsx:8` |
| `/marketing/conversas` | `/inbox` | `frontend/src/app/(main)/marketing/conversas/page.tsx:9` |
| `/metrics` | `/analytics` | `frontend/src/app/(main)/metrics/page.tsx:8` |
| `/payments` | `/carteira` | `frontend/src/app/(main)/payments/page.tsx:4` |
| `/sales` | `/vendas` | `frontend/src/app/(main)/sales/page.tsx:4` |
| `/tools` | `/ferramentas` | `frontend/src/app/(main)/tools/page.tsx:4` |

One honest-state placeholder (not a redirect but not yet functional):

| Route | Description | File:line |
|-------|-------------|-----------|
| `/campaigns` | "campaign management feature is not yet available" with skeleton UI | `frontend/src/app/(main)/campaigns/page.tsx:8-9` |

---

## Backend Endpoint Index

| Domain | Controller | File | Base Route |
|--------|-----------|------|-----------|
| Wallet (prepaid) | `PrepaidWalletController` | `backend/src/wallet/prepaid-wallet.controller.ts:27` | `/wallet/prepaid` |
| Wallet (kloel) | `WalletService` | `backend/src/kloel/wallet.service.ts` | `/kloel/wallet/:wsId/*` |
| Marketing | `MarketingController` | `backend/src/marketing/marketing.controller.ts:42` | `/marketing` |
| TikTok Marketing | `TikTokMarketingController` | `backend/src/marketing/tiktok-marketing.controller.ts` | `/marketing/tiktok` |
| Partnerships | `PartnershipsController` | `backend/src/partnerships/partnerships.controller.ts:27` | `/partnerships` |
| Products | `ProductService` | `backend/src/products/product.service.ts` | `/products` |
| Marketplace | `MarketplaceController` | `backend/src/marketplace/marketplace.controller.ts` | `/marketplace` |
| Member Areas | `MemberAreasController` | `backend/src/member-area/member-areas.controller.ts` | `/member-areas` |
| Billing | `BillingController` | `backend/src/billing/billing.controller.ts:36` | `/billing` |
| Affiliate | `AffiliateController` | `backend/src/affiliate/affiliate.controller.ts:37` | `/affiliate` |
| WhatsApp | Multiple | `backend/src/whatsapp/` (118 files), `backend/src/meta/` | `/whatsapp-api/*` |

## API Client Index

| Domain | File | Key exports |
|--------|------|------------|
| Wallet | `frontend/src/lib/api/wallet.ts` | `getWalletBalance()`, `getWalletTransactions()`, `requestWithdrawal()`, `processSale()`, `confirmTransaction()` |
| WhatsApp | `frontend/src/lib/api/whatsapp.ts` | 28+ functions: connection, messaging, catalog, screencast, session, brain |
| Partnerships | `frontend/src/lib/api/partnerships.ts` | `partnershipsApi` (list/create/approve/revoke affiliates, invite/remove collaborators) |
| Affiliate | `frontend/src/lib/api/affiliate.ts` | `affiliateApi` (affiliates, products, links) |
| Products | `frontend/src/lib/api/products.ts` | `productApi` (CRUD), `knowledgeBaseApi` |
| Billing | `frontend/src/lib/api/billing.ts` | `billingApi` (subscription, usage, checkout) |
| Meta | `frontend/src/lib/api/meta.ts` | IG account, post, insight data |

## SWR Hook Index

| Domain | File | Hooks |
|--------|------|-------|
| Wallet | `frontend/src/hooks/useWallet.ts` | `useWalletBalance()`, `useWalletTransactions()`, `useWalletChart()`, `useWalletMonthly()`, `useWalletWithdrawals()`, `useWalletAnticipations()`, `useBankAccounts()` |
| Partnerships | `frontend/src/hooks/usePartnerships.ts` | `useCollaborators()`, `useCollaboratorStats()`, `useAffiliates()`, `useAffiliateStats()`, `useAffiliateDetail()`, `usePartnerChatContacts()`, `usePartnerMessages()` |
| Email Marketing | `frontend/src/components/kloel/marketing/useEmailMarketing.ts` | `useEmailMarketing()` — SWR key: `/marketing/email/campaigns` |
| Instagram Marketing | `frontend/src/components/kloel/marketing/useInstagramMarketing.ts` | `useInstagramMarketing()` |
| Facebook Marketing | `frontend/src/components/kloel/marketing/useFacebookMarketing.ts` | `useFacebookMarketing()` |
| TikTok Marketing | `frontend/src/components/kloel/marketing/useTikTokMarketing.ts` | `useTikTokMarketing()` — SWR key: `/marketing/connect/tiktok/status` |
| Marketing Connect | `frontend/src/components/kloel/marketing/MarketingView.ConnectionHook.tsx` | `useMarketingConnection()` |

---

## Conclusion

**Batch 1 is a no-op.** All 15 candidates were resolved by prior crystallization waves (Wave 10–11). The 13 rendered pages are each backed by:

1. **Existing backend controllers** — guarded by `JwtAuthGuard` + `WorkspaceGuard` (`workspaceId`-scoped)
2. **Typed API client functions** — in `frontend/src/lib/api/<domain>.ts`
3. **SWR hooks** — in `frontend/src/hooks/` (wallet, partnerships) or inline channel hooks (marketing)
4. **Canonical view components** — in `frontend/src/components/kloel/<domain>/`

The 2 redirect-only pages (`/carteira/movimentacoes`, `/billing`) are intentional UX decisions with documented rationale in their source comments.

**No new backend endpoints. No new API clients. No new components required.**

---

To write this file, run:

```sh

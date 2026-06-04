# KloelGraph functional recovery ledger

Updated: 2026-06-03

## Mission rules

- Preserve the owner-authored KloelGraph visual contract.
- Keep route screens as the single source of UI/business behavior.
- The graph is a projection over real routes, hooks and backend data.
- No authenticated production surface may use fake seeds as source of truth.
- Every graph button must either open a real route, open a real existing mechanism, or expose an honest disabled/error state.

## Boot inventory

| Item | Current evidence |
| --- | --- |
| Branch | `chore/limpeza-profunda-2026-06-03-0940`, tracking `origin/... [gone]` |
| Layout mount | `frontend/src/app/(main)/layout.tsx` -> `MainAppLayoutShell` -> `KloelGraphShell` when graph flag is enabled |
| Rollback shell | `AppShell`, selected only when `NEXT_PUBLIC_KLOEL_GRAPH_ENABLED` is explicit false/0/off |
| Current graph implementation | Route-based shell in `frontend/src/components/kloel/graph/*` |
| Literal visual reference | Historical `KloelGraphPrototype.jsx` in `f01ce554f` / `1952f68ce`, with SVG canvas, physics, floating nav, settings and overlay |
| Legacy/sidebar chrome | `AppShell` remains as rollback; sidebar is not used when graph flag is enabled |
| Root frontend scripts | `frontend`: `dev`, `build`, `lint`, `typecheck`, `test` |
| Root validation scripts | root: `lint`, `typecheck`, `frontend:typecheck`, `test`, `build`, `check:all` |

## Node to real screen map

| Module | Graph node/panel | Real screen/component mounted today | Legacy/function source | Lost or at-risk mechanisms | Hooks/services/endpoints | Status | Files changed | Validation/evidence | Pendencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Perfil | `perfil`, `perfil-*` | `/settings`, `/settings?section=...` via route child in overlay | `conta/ContaView.tsx`, `Conta*Section` | Apps/integrations require deeper OAuth validation; birth-date picker, CNPJ/CEP, docs, bank, 2FA and team covered in focused slices | `useKyc`, `useBrazilianBanks`, `kyc`, `team`, `documents`, `meta` APIs | Personal, Fiscal, Docs, Bank, Security and Team slices recovered/proven by focused tests and Chrome flows | `ContaDadosPessoaisSection.tsx`, `ContaDadosPessoaisSection.test.tsx`, `ContaDadosFiscaisSection.test.tsx`, `ContaDocumentosSection.test.tsx`, `ContaDadosBancariosSection.test.tsx`, `ContaSegurancaSection.test.tsx`, `ContaTeamSection.tsx`, `ContaTeamSection.test.tsx`, `backend/src/team/team.service.ts`, `backend/src/team/team.service.spec.ts`, `backend/src/team/team.service.remove-member.spec.ts` | 12 focused Perfil UI tests passed in current slice; backend Team tests passed; frontend/backend typechecks passed; Chrome proved invite accept, role update and remove through graph overlay | Need apps/OAuth audit and broader graph product/performance sweep |
| Dashboard | `perfil-dashboard`, metrics | `/dashboard` -> `HomeView` | `HomeView`, `HomeKpiTiles`, `HomeRecentActivity` | Metric detail nodes and live refresh require validation | dashboard/home APIs | Inventory complete, validation pending | none | Route file imports `HomeView` | Need map metric nodes to report detail if missing |
| Kloel | `kloel`, `kloel-chat`, `kloel-search`, `kloel-recents` | `/chat`; search/recents use existing command palette action | `UniversalComposer`, chat containers, `CommandPalette` | Plus menu, attachments and product link recovered in this slice; web/image/refinement actions still need full parity audit | `sendAuthenticatedKloelMessage`, `/kloel/upload-chat`, `/kloel/approvals/pending`, products APIs | Chat composer slice recovered and browser-validated | `KloelChatComposerParts.tsx`, `KloelChatComposerTopRail.tsx`, `KloelDashboardView.ComposerSection.tsx`, `KloelDashboardView.tsx`, `KloelChatComposer*.test.tsx`, `KloelDashboardView.test.tsx`, `backend/src/kloel/kloel.controller.ts`, `backend/src/kloel/kloel.controller.spec.ts` | Focused Vitest 8/8 passed; frontend typecheck passed; backend focused Jest passed; backend typecheck passed; Chrome DevTools verified approvals absent, menu opens above with all five actions visible and unclipped, real text upload returns `POST /kloel/upload-chat [201]`, no ready/size metadata leaks in upload chip, product submenu lists real workspace products, product selection keeps overlay open and renders compact 220x46 name-only chip; screenshots: `.tmp/kloel-chat-composer-validation.png`, `.tmp/kloel-chat-product-chip-validation.png` | Need verify historical conversations, message streaming/AI response, web search/image generation/site/refinement actions and persistence |
| Criar | `criar`, `criar-products`, dynamic product nodes | `/products`, `/products/:id`, `/products/new`, `/checkout/...` | `ProdutosView`, `ProductNerveCenter*`, checkout screens | Product subnodes present; plan/checkout focus needs deeper live validation | `useProducts`, `/checkout/products`, `useCheckoutPlans` | Real backend data verified for graph projection; fake product fallback guarded by tests | `KloelGraphLiteralCanvas.tsx`, `KloelGraphShell.tsx`, `KloelGraphFloatingNav.tsx`, `KloelGraphSettingsPanel.tsx`, `KloelGraphChromeButtons.tsx`, `KloelGraphTheme.tsx`, `KloelGraphShell.helpers.ts`, `KloelGraphShell.spec.tsx`, `KloelGraph.routes.spec.ts` | Focused graph/products tests passed; frontend typecheck passed; Chrome authenticated earlier saw real nodes `E2E Smoke Product (edited)` and `E2E Recovery Proof Product` plus the 10 product subnodes | Need validate product fotos/plans mutations and ProductNerveCenter action persistence |
| Afiliar | `afiliar-*` | `/produtos/afiliar-se`, `/parcerias*` | `ProdutosAfiliarSeTab`, `ParceriasView` | Marketplace/saved/partner chat/actions need browser validation | `affiliateApi`, `usePartnerships` | API/hooks audited/proven; UI browser validation pending | none | Focused affiliate API/partnership tests passed | Need overlay/browser endpoint action audit |
| Educar | `educar-area-membros` | `/produtos/area-membros` | `ProdutosAreaMembrosTab`, member-area components | Course creation, module/lesson uploads, enrollments/certificates require browser validation | `useMemberAreas`, member area APIs | API/hooks audited/proven; UI browser validation pending | none | Focused member-area API/hooks tests passed | Need detailed UI mechanism/browser audit |
| Conversar | `conectar-*`, channel nodes | `/inbox`, `/crm`, `/leads`, `/marketing/:channel`, `/anuncios`, `/autopilot` | Inbox/CRM/marketing channel components | Artistic channel connection flow and all OAuth/status actions require browser validation | CRM, conversations, marketing, Meta/TikTok/Google APIs | Hooks/API audited/proven; channel UI browser validation pending | none | Focused CRM/sales/anuncios/conversations/autopilot tests passed | Need compare channel legacy visual with current route and validate OAuth/status actions |
| Consultar | `consultar-*` | `/carteira/*`, `/analytics?tab=...` | `KloelCarteira`, analytics tabs | Withdraw/anticipation modals, filters/export/pagination require browser validation | wallet and analytics APIs | Wallet hooks audited/proven; analytics validation pending | none | `useWallet` focused tests passed; wallet route uses real hooks and honest empty-zero fallback only | Need browser validation, analytics/export/pagination evidence and wallet mutation persistence proof |
| Graph visual engine | Canvas/navigation/overlay | `KloelGraphShell` route-based canvas | Literal prototype `GraphCanvas`, `FloatingNav`, `KloelOverlay` | Remaining work is deeper byte/parity audit against prototype; major simplifications replaced in this slice | graph helpers, real route children, command palette | Literal canvas/settings/nav/core/overlay slice recovered and verified | `KloelGraphLiteralCanvas.tsx`, `KloelGraphFloatingNav.tsx`, `KloelGraphChromeButtons.tsx`, `KloelGraphSettingsPanel.tsx`, `KloelGraphOverlay.tsx`, `KloelGraphShell.tsx`, `KloelGraphShell.helpers.ts`, `KloelGraph.routes.ts`, `KloelGraph.static-nodes.ts`, `KloelGraphNodeButton.tsx`, `KloelGraphTheme.tsx`, `KloelGraphShell.spec.tsx` | Typecheck passed; focused ESLint passed; `KloelGraphShell.spec.tsx` 8/8 passed; Chrome DevTools verified seven-item nav, settings panel, authenticated real product nodes, `ProductNerveCenter` overlay, and outside-click close to `?graph=1` | Continue full prototype byte/parity audit, mobile focus trap, and full mechanism recovery queue |

## Dead-button audit queue

| Area | Mechanism | Current source to inspect | Status |
| --- | --- | --- | --- |
| Kloel Chat | `+` menu, upload chips and product-link action | `UniversalComposer`, `KloelChatComposer`, chat tests | Composer slice recovered; AI/web/image/site/refinement actions still pending full parity audit |
| Perfil Fiscal | CNPJ and CEP autofill | `ContaDadosFiscaisSection`, `useKyc`, fiscal APIs | Focused component test proves CNPJ lookup, CEP lookup, autofill, fiscal save payload and refetch trigger; browser proof still blocked |
| Perfil Docs | Upload progress/status | `ContaDocumentosSection`, `useKycDocuments`, documents APIs | Focused component test proves identity upload calls `uploadDocument` and PJ switches second slot to company document |
| Perfil Banco | Brazilian bank registry | `ContaDadosBancariosSection`, `useBrazilianBanks` | Focused component test proves registry dropdown selection, bank code fill and `updateBank` persistence payload |
| Canais | Artistic channel connection flow | `marketing/*`, channel onboarding components | Pending |
| Produtos | Product image upload and plan/checkout mutations | `ProductNerveCenter*`, products APIs | Pending |

## Current first slice

1. Add a regression test for the prototype drag-vs-click threshold: movement greater than 4px must not open a node.
2. Port or expose the literal graph interaction threshold in the route-based shell.
3. Continue replacing the simplified visual engine with the literal SVG/physics engine while preserving route children in the overlay.


## 2026-06-03 chat validation addendum

| Item | Evidence |
| --- | --- |
| Composer menu direction | Chrome DevTools confirmed `data-testid=kloel-composer-popover` opens above the plus button, all five actions visible, no clipping. |
| Approval notifications | Removed from chat composition surface; focused DOM test and Chrome validation show no `Aprovacoes pendentes` text. |
| Attachment/product chips | Real upload to `/kloel/upload-chat` returned 201; ready chips are compact name-only surfaces with no size/mime/client metadata leak. |
| Pre-response trace | Added `Pré-resposta executável` assistant trace seeded before streaming; focused Vitest renders it before assistant text and Chrome DevTools captured it in the live graph overlay. |
| Visual evidence | `.tmp/kloel-chat-attachments-after-polish.png`, `.tmp/kloel-chat-product-chip-after-polish.png`, `.tmp/kloel-chat-pre-response-trace.png`. |
| Validation commands | `npm --prefix frontend test -- KloelDashboardView.test.tsx`; `npm --prefix frontend run typecheck`; `npm --prefix frontend test -- KloelChatComposer.test.tsx KloelChatComposer.attachments.test.tsx KloelDashboardView.test.tsx`. |

## 2026-06-03 executable pre-response backend addendum

| Item | Evidence |
| --- | --- |
| Composer action trace | `runComposerCapabilityBranch` now emits `tool_call` before executing `create_image`, `create_site` or `search_web`, and emits `tool_result` before streaming final content. |
| Failure trace | Composer capability errors now emit a failed `tool_result` with the concrete error before the error propagates to the existing SSE error handling path. |
| Regression test | Added focused Jest coverage in `backend/src/kloel/kloel-thinker.service.spec.ts` proving deterministic `search_web` emits `tool_call`, `tool_result` and `content`. |
| Validation command | `npm --prefix backend test -- kloel-thinker.service.spec.ts` passed after first failing on the missing `tool_call`/`tool_result` events. |
| Compact observations | Added regression coverage proving `create_site` does not stream raw `generatedSiteHtml` inside `tool_result`; the trace now carries `generatedSiteHtmlBytes` + `generatedSiteHtmlOmitted` while final persistence/done metadata remains complete. |
| Additional validation | `npm --prefix backend test -- kloel-thinker.service.spec.ts` passed after the red sanitization test; `npm --prefix backend run typecheck` passed. |

## 2026-06-03 Kloel Recents/history audit addendum

| Item | Evidence |
| --- | --- |
| Real data path | Graph node `kloel-recents` routes to `/chat?graphAction=recents`; `KloelGraphShell` opens the existing command palette in `conversations` mode; `ConversationHistoryProvider` loads `/kloel/threads?limit=20` and `loadAllConversations()` paginates `/kloel/threads?limit=50`. |
| Error honesty | `use-command-palette` preserves conversation load/search errors instead of silently showing fake empty recents. |
| Validation command | `npm --prefix frontend test -- src/components/kloel/search/use-command-palette.test.tsx src/components/kloel/graph/KloelGraphShell.spec.tsx src/hooks/__tests__/useConversationHistory.test.tsx` passed (22 tests). |
| Browser validation status | Chrome DevTools MCP is currently blocked by its own profile already running at `/Users/danielpenin/.cache/chrome-devtools-mcp/chrome-profile`; no browser success claimed for this audit slice. |

## 2026-06-03 Perfil personal/KYC addendum

| Item | Evidence |
| --- | --- |
| Birth date mechanism | Replaced the raw native `type=date` field in `ContaDadosPessoaisSection` with a controlled day/month/year pop-up picker that stores date-only `YYYY-MM-DD` values. |
| Persistence path | The picker feeds the existing `useProfileMutations().updateProfile` save path; focused regression proves `birthDate` is persisted with the rest of personal profile payload. |
| KYC backend/frontend wiring | `kycApi` uses real `/kyc/profile`, `/kyc/fiscal`, `/kyc/lookup/cnpj/:cnpj`, `/kyc/lookup/cep/:cep`, `/kyc/documents`, `/kyc/bank`, `/kyc/security` endpoints; backend controller/service expose the same routes. |
| Brazilian banks | `useBrazilianBanks` consumes `/kyc/banks` and falls back to the local Brazilian registry only as offline resilience, not authenticated fake account data. |
| Validation commands | `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosPessoaisSection.test.tsx`; `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosPessoaisSection.test.tsx src/lib/api/kyc.test.ts src/hooks/useKyc.test.ts src/hooks/useBrazilianBanks.test.ts`; `npm --prefix frontend run typecheck` all passed. |
| Browser validation status | Chrome DevTools MCP remains unavailable because the shared profile is already locked/running; no browser success claimed for this slice. |

## 2026-06-03 Perfil fiscal addendum

| Item | Evidence |
| --- | --- |
| CNPJ autofill | Added component coverage proving a valid CNPJ calls `kycApi.lookupCnpj`, merges legal name, fantasy name, address and responsible person fields into the fiscal form. |
| CEP autofill | Added component coverage proving a valid corrected CEP calls `kycApi.lookupCep` and updates address fields without discarding previously filled fiscal data. |
| Fiscal persistence | The same regression proves `useFiscalMutations().updateFiscal` receives the persisted PJ payload with CNPJ, address, responsible CPF/name and selected CEP, then triggers `mutate()`. |
| Validation commands | `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosFiscaisSection.test.tsx`; `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosFiscaisSection.test.tsx src/components/kloel/conta/ContaDadosPessoaisSection.test.tsx src/components/kloel/conta/ContaDocumentosSection.test.tsx src/components/kloel/conta/ContaDadosBancariosSection.test.tsx src/components/kloel/conta/ContaSegurancaSection.test.tsx src/lib/api/kyc.test.ts src/hooks/useKyc.test.ts src/hooks/useBrazilianBanks.test.ts`; `npm --prefix frontend run typecheck` all passed. |
| Browser validation status | Chrome DevTools MCP remains unavailable because the shared profile is already locked/running; no browser success claimed for this slice. |

## 2026-06-03 Perfil docs/bank/security addendum

| Item | Evidence |
| --- | --- |
| Documents upload | Added component coverage proving `Documento de identidade` file selection calls `useDocumentMutations().uploadDocument('DOCUMENT_FRONT', file)` and refreshes via `mutate()`. |
| PJ document mechanics | Added component coverage proving PJ fiscal accounts render and expose the `Contrato social ou cartao CNPJ` upload slot. |
| Bank selector | Added component coverage proving the Brazilian bank selector opens, filters a registry result, selects `Nu Pagamentos S.A.`, fills code `260`, and persists account data through `useBankMutations().updateBank`. |
| MFA/2FA | Added component coverage proving `Configurar 2FA` calls `startMfaSetup`, renders a QR code, accepts a six-digit code, and calls `verifyMfaSetup`. |
| Validation commands | `npm --prefix frontend test -- src/components/kloel/conta/ContaDocumentosSection.test.tsx src/components/kloel/conta/ContaDadosBancariosSection.test.tsx`; `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosPessoaisSection.test.tsx src/components/kloel/conta/ContaDocumentosSection.test.tsx src/components/kloel/conta/ContaDadosBancariosSection.test.tsx src/components/kloel/conta/ContaSegurancaSection.test.tsx src/lib/api/kyc.test.ts src/hooks/useKyc.test.ts src/hooks/useBrazilianBanks.test.ts`; `npm --prefix frontend run typecheck` all passed. |
| Concrete remaining risk | `ContaSegurancaSection` still displays `Sessoes ativas` as an unavailable unified view; no active-session endpoint/mechanism was recovered in this slice. |

## 2026-06-03 Criar/products graph de-seed addendum

| Item | Evidence |
| --- | --- |
| Runtime graph product source | `KloelGraphShell` derives product nodes only from `useProducts()` and `loadCheckoutGraphProducts()` (`/checkout/products` + per-product checkout detail). |
| No fake fallback | Added regression coverage proving empty product sources produce no product nodes and static graph nodes do not contain the legacy fake product labels `ghk-cu` or `pdrn`. |
| ProductNerveCenter wiring | Audited `ProductNerveCenterRoot.js`: it uses `useProduct(productId)`, `useProducts()`, `useProductMutations()`, `useCheckoutPlans(rawProduct)`, `apiFetch`, `/products/:id/urls`, `/products/:id/coupons`, `/checkout/products` and `uploadGenericMedia`; no `GHK/PDRN` runtime seed found in the graph path. |
| Validation commands | `npm --prefix frontend test -- src/hooks/useProducts.test.ts src/components/kloel/graph/KloelGraph.routes.spec.ts src/components/kloel/graph/KloelGraphShell.spec.tsx` passed (33 tests); `npm --prefix frontend run typecheck` passed. |
| Browser validation status | Chrome DevTools MCP remains unavailable because the shared profile is already locked/running; product image/plan/checkout mutation browser proof is still pending. |

## 2026-06-03 Consultar/wallet de-seed addendum

| Item | Evidence |
| --- | --- |
| Runtime wallet source | `KloelCarteira` uses `useWalletBalance`, `useWalletTransactions`, `useWalletChart`, `useWalletWithdrawals`, `useWalletAnticipations` and wallet modals, all backed by `/kloel/wallet/:workspaceId/...` routes. |
| No fake money seed | The only runtime default found was `DEFAULT_WALLET_ANTICIPATION_TOTALS` with zero values; malformed transactions, withdrawals, bank accounts and anticipations surface explicit `Invalid wallet ... payload` errors instead of fake data. |
| Validation command | `npm --prefix frontend test -- src/hooks/__tests__/useWallet.test.ts` passed (24 tests). |
| Remaining risk | Browser validation of withdraw/anticipation modals, mutation persistence, analytics filters/export/pagination and real provider responses is still pending while Chrome DevTools MCP is blocked. |

## 2026-06-03 Afiliar/Educar API-hook audit addendum

| Item | Evidence |
| --- | --- |
| Afiliar source | `ProdutosView` hydrates marketplace, stats, links and affiliate products through `affiliateApi.marketplace`, `marketplaceStats`, `myLinks` and `myProducts`; `ProdutosAfiliarSeTab` uses `requestAffiliation`, `saveProduct` and `unsaveProduct` for actions. |
| Educar source | `ProdutosView` reads member areas through `useMemberAreas`; `ProdutosAreaMembrosTab` uses `useMemberAreaMutations`, `memberAreaApi` and `memberAreaStudentsApi` for areas/modules/lessons/students. |
| De-seed scan | No runtime `*_SEED`, `GHK` or `PDRN` source found in the Afiliar/Educar components/hooks/API path; invalid member-area payloads surface errors instead of fake lists. |
| Validation command | `npm --prefix frontend test -- src/lib/api/affiliate.test.ts src/hooks/__tests__/usePartnerships.test.ts src/lib/api/member-area.test.ts src/hooks/useMemberAreas.test.ts` passed (69 tests). |
| Remaining risk | Full browser proof of marketplace request/save flows, partner actions, course/module/lesson creation, uploads and certificates is still pending while Chrome DevTools MCP is blocked. |

## 2026-06-03 Conversar/CRM/ads/autopilot audit addendum

| Item | Evidence |
| --- | --- |
| CRM/conversations source | CRM hooks read `/crm/contacts`, `/crm/pipelines`, `/crm/deals`; conversation APIs reject unconfirmed inbox-agent payloads instead of faking lists. |
| Sales/anuncios source | Sales hooks read `/sales*` endpoints and reject invalid sales/stats/chart payloads; Anuncios hooks read `/api/anuncios/status` and `/api/anuncios/campaigns`. |
| Autopilot source | Autopilot API helpers call real `/autopilot/*` endpoints for status, config, stats, impact, pipeline, actions, retry, conversion, run, insights and direct send. |
| Validation command | `npm --prefix frontend test -- src/hooks/useCRM.test.ts src/hooks/useSales.test.ts src/hooks/useSalesPipeline.test.ts src/hooks/useAnuncios.test.ts src/lib/api/crm.test.ts src/lib/api/conversations.test.ts src/lib/api/autopilot.test.ts` passed (117 tests). |
| Remaining risk | Full browser proof for Inbox/CRM cards, channel OAuth/status screens, anuncios UI actions and Autopilot UI flows is still pending while Chrome DevTools MCP is blocked. |

## 2026-06-04 browser/runtime validation addendum

| Item | Evidence |
| --- | --- |
| Local servers | Frontend dev server is ready at `http://localhost:3000`; backend dev server is listening on `*:3001`. |
| Backend auth boundary | `curl -i http://localhost:3001/workspace/me` returned `401 Unauthorized` with `Missing Authorization header`, proving the API is reachable and rejecting unauthenticated calls correctly. |
| Graph entry browser route | Chrome DevTools opened `http://localhost:3000/products?graph=1`; the app redirected to `http://auth.localhost:3000/login?forceAuth=1&next=%2Fproducts%3Fgraph%3D1`. |
| Browser network | The selected page shows `GET /products?graph=1 [307]`, login page `[200]`, `GET http://localhost:3001/workspace/me [401]`, `POST http://localhost:3001/auth/refresh [401]`, and `GET /auth/apple/diagnostic [304]`. |
| Browser console | Only auth-related `401 Unauthorized` resource errors and Apple Sign-In diagnostic warnings appeared on the login page. |
| Concrete blocker | Authenticated graph/tela mutation proof cannot be completed in this browser session without real login credentials or a valid local auth cookie/session. No authenticated browser success is claimed. |

## 2026-06-04 verification addendum

| Item | Evidence |
| --- | --- |
| Focused frontend regression suite | `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosFiscaisSection.test.tsx src/components/kloel/conta/ContaDadosPessoaisSection.test.tsx src/components/kloel/conta/ContaDocumentosSection.test.tsx src/components/kloel/conta/ContaDadosBancariosSection.test.tsx src/components/kloel/conta/ContaSegurancaSection.test.tsx src/lib/api/kyc.test.ts src/hooks/useKyc.test.ts src/hooks/useBrazilianBanks.test.ts src/hooks/useProducts.test.ts src/components/kloel/graph/KloelGraph.routes.spec.ts src/components/kloel/graph/KloelGraphShell.spec.tsx src/hooks/__tests__/useWallet.test.ts src/lib/api/affiliate.test.ts src/hooks/__tests__/usePartnerships.test.ts src/lib/api/member-area.test.ts src/hooks/useMemberAreas.test.ts src/hooks/useCRM.test.ts src/hooks/useSales.test.ts src/hooks/useSalesPipeline.test.ts src/hooks/useAnuncios.test.ts src/lib/api/crm.test.ts src/lib/api/conversations.test.ts src/lib/api/autopilot.test.ts src/components/kloel/search/use-command-palette.test.tsx src/hooks/__tests__/useConversationHistory.test.tsx` passed: 25 files, 284 tests. |
| Focused reruns after lint fixes | `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosPessoaisSection.test.tsx` passed; `npm --prefix backend test -- kloel-thinker.service.spec.ts` passed. |
| Typecheck | `npm --prefix frontend run typecheck` passed; `npm --prefix backend run typecheck` passed. |
| Build | `npm --prefix frontend run build` passed; `npm --prefix backend run build` passed. |
| Frontend lint | `npm --prefix frontend run lint` passed after replacing the birth-date picker effect with an open-click draft sync. |
| Backend lint touched files | `npx eslint src/kloel/kloel-thinker-think.helpers.ts src/kloel/kloel-thinker.service.spec.ts` passed inside `backend/`. |
| Backend lint global | `npm --prefix backend run lint:check` still fails with 329 existing errors across broad backend/e2e files (`billing`, `campaigns`, `copilot`, `channel-transport-whatsapp`, `wallet`, multiple `test/*.e2e-spec.ts`, etc.); touched trace files were cleaned and pass targeted lint. |
| Runtime seed scan | `rg` over `frontend/src/components/kloel`, `frontend/src/hooks` and `frontend/src/lib/api` found `GHK/PDRN/SEED` only in tests or graph `_Y` planning docs. The apparent `COUPONS` symbol in `ProductNerveCenterRoot.js` is derived from `/products/:id/coupons`, not from a static seed. |

## 2026-06-04 Dashboard metric node addendum

| Item | Evidence |
| --- | --- |
| Metric nodes | Added Dashboard child nodes for the 9 canonical Home KPI metrics: total revenue, month revenue, today revenue, available balance, pending balance, revenue, sales, conversion and average ticket. |
| Real screen routes | Metric nodes deep-link to existing real screens instead of reconstructed panels: sales revenue metrics route to `/analytics?tab=vendas&graphMetric=...`, conversion/ticket route to `/analytics?tab=metricas&graphMetric=...`, and balance metrics route to `/carteira/saldo?graphMetric=...`. |
| Route compatibility | Regression coverage proves `/analytics?tab=vendas&graphMetric=sales` resolves to `dashboard-metric-sales`, while the regular report route `/analytics?tab=vendas` still resolves to `consultar-report-vendas`. |
| TDD evidence | `npm --prefix frontend test -- src/components/kloel/graph/KloelGraph.routes.spec.ts` first failed because Dashboard exposed no metric child nodes, then passed after adding the metric node contract. |
| Validation commands | `npm --prefix frontend test -- src/components/kloel/graph/KloelGraph.routes.spec.ts src/components/kloel/graph/KloelGraphShell.spec.tsx` passed (18 tests); `npm --prefix frontend run typecheck` passed; `npx eslint src/components/kloel/graph/KloelGraph.routes.spec.ts src/components/kloel/graph/KloelGraph.static-nodes.ts` passed inside `frontend/`. |

## 2026-06-04 Perfil security sessions addendum

| Item | Evidence |
| --- | --- |
| Real session source | `KycService.getSecurity()` now includes active sessions from real `refreshToken` rows (`agentId`, `revoked=false`, `expiresAt > now`) instead of leaving the graph account panel with a fixed unavailable placeholder. |
| Session revocation | Added authenticated `DELETE /kyc/security/sessions/:sessionId`; service uses `refreshToken.updateMany({ id, agentId, revoked:false })` so one agent cannot revoke another account's session. |
| Frontend wiring | `kycApi.revokeSecuritySession`, `useSecurityState().security.sessions` validation and `useSecurityMutations().revokeSession` feed `ContaSegurancaSection`; the `Sessoes ativas` card now renders loading/error/empty/real session rows and calls the backend revocation mutation followed by `mutate()`. |
| No invented device data | UI only displays session creation and expiry timestamps because the current `RAC_RefreshToken` schema exposes no trusted IP, device, browser or location metadata. No fake active device labels were added. |
| TDD evidence | Frontend tests first failed on the unavailable placeholder/malformed sessions/missing API method; backend tests first failed on missing controller/service methods. After implementation, the same focused suites passed. |
| Validation commands | `npm --prefix frontend test -- src/components/kloel/conta/ContaSegurancaSection.test.tsx src/hooks/useKyc.test.ts src/lib/api/kyc.test.ts` passed (22 tests); `npm --prefix backend test -- kyc.service.spec.ts kyc.controller.spec.ts --runInBand` passed; `npm --prefix frontend run typecheck` passed; `npm --prefix backend run typecheck` passed; targeted frontend and backend ESLint commands passed. |

## 2026-06-04 Kloel chat composer shortcut addendum

| Item | Evidence |
| --- | --- |
| Dead-mechanism risk | The send button already blocked pending uploads, but the textarea `Enter` shortcut called `onSend()` directly and bypassed that same guard. |
| TDD evidence | Added `KloelChatComposer.attachments.test.tsx` coverage for pressing Enter while an attachment is still uploading; it failed first because `onSend` was called once. |
| Fix | `KloelChatComposer` now gates the Enter shortcut with `canSend && !hasPendingUploads`, matching the real send button behavior without changing the composer visual surface. |
| Validation commands | `npm --prefix frontend test -- src/components/kloel/dashboard/KloelChatComposer.attachments.test.tsx src/components/kloel/dashboard/KloelChatComposer.test.tsx` passed (8 tests); `npm --prefix frontend run typecheck` passed; `npx eslint src/components/kloel/dashboard/KloelChatComposer.tsx src/components/kloel/dashboard/KloelChatComposer.attachments.test.tsx src/components/kloel/dashboard/KloelChatComposer.test.tsx` passed inside `frontend/`. |

## 2026-06-04 Login graph auth recovery addendum

| Item | Evidence |
| --- | --- |
| Root cause | Local protected routes redirected to `auth.localhost`/`app.localhost`, creating host-only auth cookies that the app host could not see. After switching to `auth.root.localhost`/`app.root.localhost`, Next dev blocked internal resources until `allowedDevOrigins` included the shared local hosts, leaving the login form as an unhydrated HTML submit. |
| Host/cookie fix | `localSubdomainHost()` now maps non-marketing localhost targets through `root.localhost`; `next.config.ts` allows `root.localhost`, `*.root.localhost`, `auth.root.localhost`, `app.root.localhost` and `pay.root.localhost` in dev. |
| Auth bootstrap fix | `authApi.getMe()` now calls same-origin `/api/workspace/me`, forwarding bearer token/workspace headers to the existing Next proxy that normalizes backend `/workspace/me` into `{ user, workspace, workspaces }`. This removed the browser `missing-user` bootstrap warning. |
| Browser proof | Chrome DevTools isolated context `kloel-graph-login-final-20260604`: `http://localhost:3000/products?graph=1` redirected to `http://auth.root.localhost:3000/login?forceAuth=1&next=%2Fproducts%3Fgraph%3D1`; submitting the E2E account reached `http://app.root.localhost:3000/products?graph=1` with the KloelGraph a11y tree present (`Abrir Perfil`, `Abrir Kloel`, `Abrir Criar`, navigation `KloelGraph`). |
| Network proof | Final Chrome network: `GET http://app.root.localhost:3000/products?graph=1&auth=1 [200]`, `GET http://app.root.localhost:3000/api/workspace/me [200]`, `GET http://localhost:3001/products [200]`, `GET http://localhost:3001/checkout/products [200]`, `GET http://localhost:3001/auth/me [304]`, billing subscription `[304]`, Kloel threads `[200]`; fonts/dev resources returned `[200]`. |
| Console proof | Final Chrome console contained only React DevTools info and `[HMR] connected`; no `missing-user`, no blocked dev resource errors, no auth loop. |
| Backend proof | Backend request log for the final browser run included `POST /auth/login [201]` for `codex-graph-1780537354035@example.com`, followed by `/auth/me [200]`, `/billing/subscription?... [200]`, `/products [200]`, `/checkout/products [200]`, `/workspace/me [200]` and `/kloel/threads?limit=20 [200]`. |
| Validation commands | `npm --prefix frontend test -- src/lib/api/auth.test.ts src/lib/__tests__/subdomains.test.ts` passed (101 tests); `npm --prefix frontend run typecheck` passed. |

## 2026-06-04 Kloel chat agent trace addendum

| Item | Evidence |
| --- | --- |
| Deterministic self-code bypass | Broad reflective prompts such as `voce consegue observar seu codigo fonte e suas ferramentas internas?` no longer match the deterministic `code_outline` branch; only explicit file/path inspection still routes directly to code tools. |
| Model planning trigger | Agent-trace, pre-response, reasoning, observations, internal-tools and source-code questions now enter the model/tool-planning path instead of falling through to a hand-coded one-line code response. |
| Executable trace spans | Backend `tool_call` and `tool_result` SSE events carry correlated `spanId`; tool observations also carry `durationMs` and `artifactId` when present. `KloelToolRouter` measures tool duration once per span. |
| Persisted trace | Stored assistant trace entries now keep `spanId`, `artifactId` and `durationMs`, use distinct `:call`/`:result` ids, ignore duplicate textual tool status events, and summarize trajectories as `Raciocinio resumido, acao real e observacao antes da resposta final`. |
| Frontend trace UI | `kloel-message-ui` preserves span fields, normalizes legacy persisted tool labels, hides duplicate tool status events, maps internal tool names to product-grade labels, and `AssistantResponseChrome` renders per-span duration without React duplicate-key collisions. |
| Validation commands | `npm --prefix frontend test -- src/lib/__tests__/kloel-stream-events.test.ts src/lib/__tests__/kloel-message-ui.test.ts` passed (13 tests); `npm --prefix backend test -- kloel-stream-events.spec.ts kloel-tool-router.spec.ts kloel-reply-engine.service.spec.ts guest-chat.action-intent.helpers.spec.ts kloel-thread.helpers.spec.ts --runInBand` passed. |
| Known blocker | Global backend typecheck currently still fails outside this slice at `src/admin/auth/admin-auth.controller.ts(29,69)` because `Request.ip` is `string | undefined` but `HttpRequestLike.ip` expects `string`; focused Kloel tests pass. |
| Browser validation status | Pending after backend restart and live Chrome conversation with Kloel. |

## 2026-06-04 Educar member-area graph node addendum

| Item | Evidence |
| --- | --- |
| Real data source | `KloelGraphShell` now consumes `useMemberAreas()` and projects real `/member-areas` records into graph entity nodes under `educar-area-membros`; records without ids are ignored. |
| Dynamic node route | Real member-area nodes use `/produtos/area-membros?areaId=<id>` and the deep-link resolver now checks caller-provided dynamic nodes before falling back to static route nodes. |
| Navigation fix | Graph-only routes no longer pin `displayArea` to the active route forever. Route changes sync `focusedArea` once, and floating navigation can recenter to another galaxy afterward. This fixed `/chat?graph=1` staying stuck on Kloel after clicking `EDUCAR`. |
| TDD evidence | `KloelGraphShell.spec.tsx` first failed because `Abrir Curso real` was missing before `useMemberAreas()` was wired. A later Chrome-found regression was captured by `lets floating navigation recenter graph-only mode away from the active route`, which failed with `Educar` still `transparent` before the navigation fix. |
| Backend proof | Created local tester `codex-memberarea-1780548364@example.com` through `POST /auth/register`, then created real member area `d546a412-34b7-42f5-a5f6-e8639f6785f7` through authenticated `POST /member-areas`; authenticated `GET /member-areas` returned `Curso real graph 014604` with `active: true`. |
| Chrome proof | Logged in through `http://auth.root.localhost:3000/login?...` with the tester, reached `http://app.root.localhost:3000/chat?...&graph=1`; Chrome a11y tree showed `Abrir Curso real graph 014604`. After the navigation fix, clicking `EDUCAR` visibly recentered to the Educar galaxy (`/tmp/kloel-educar-after-nav-fix.png`), and clicking the real course node navigated to `http://app.root.localhost:3000/produtos/area-membros?areaId=d546a412-34b7-42f5-a5f6-e8639f6785f7` with dialog `Area de membros` showing `Curso real graph 014604`, `1/1 areas ativas`, and `0 alunos`. |
| Console proof | Final Chrome console after the flow contained only Fast Refresh messages and a Next warning about `scroll-behavior: smooth`; no runtime error was emitted. |
| Validation commands | `npm --prefix frontend test -- KloelGraphShell.spec.tsx KloelGraph.routes.spec.ts` passed (2 files, 21 tests); `npm --prefix frontend run typecheck` passed; focused `npx eslint src/components/kloel/graph/KloelGraphShell.tsx src/components/kloel/graph/KloelGraphShell.helpers.ts src/components/kloel/graph/KloelGraph.routes.ts src/components/kloel/graph/KloelGraph.routes.spec.ts src/components/kloel/graph/KloelGraphShell.spec.tsx` passed; Prettier ran on graph files. |

## 2026-06-04 Kloel chat executable pre-response persistence addendum

| Item | Evidence |
| --- | --- |
| Model-generated pre-response extraction | Assistant text using `Raciocinio resumido`, `Acoes`, `Observacoes` and `Resposta final` is now split before persistence: the final answer is stored as clean assistant content, while the pre-response becomes structured `processingTrace` entries. |
| Compact user-facing summary | When the trace comes from model-generated pre-response text, persisted `processingSummary` is intentionally compact: `Raciocínio resumido, ações e observações antes da resposta final.` This avoids dumping the whole trace in the collapsed card. |
| No raw tool/code leak | The Chrome-validated response stores the short final content only: `Codex, o comportamento ajustado está validado e funcionando...`, with 3 trace entries in metadata and no raw internal tool names in the visible final answer. |
| Runtime loop fix | Chrome DevTools captured `Maximum update depth exceeded` from `KloelChatComposer[<textarea>.onChange]`; `KloelChatComposer` now ignores unchanged controlled textarea values before calling `onInputChange`, and focused coverage locks this behavior. |
| Browser proof | Authenticated tester conversation `46f0973d-9c8a-43c9-9923-d026dbff1b12` was exercised in Chrome at `http://app.root.localhost:3000/chat?...`; API proof saved in `/tmp/kloel-chat-pre-response-api.json`, screenshot in `/tmp/kloel-chat-pre-response-proof.png`, reload snapshot in `/tmp/kloel-chat-after-loop-fix-snapshot.txt`. The final reload snapshot shows the new card summary and clean final answer. |
| Console proof | After the textarea guard and page reload, Chrome DevTools `list_console_messages` returned `<no console messages found>`. |
| Validation commands | `npm --prefix backend test -- kloel-thread.helpers.spec.ts kloel-thinker.service.spec.ts` passed; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed; `npm --prefix frontend test -- KloelChatComposer.test.tsx` passed (6 tests); `npm --prefix frontend run typecheck` passed. |

## 2026-06-04 Kloel chat canonical trace labels addendum

| Item | Evidence |
| --- | --- |
| Canonical alias extraction | Backend tests cover `Chain-of-thought`, `Reasoning trace / reasoning chain`, `Scratchpad`, `Extended thinking / thinking blocks`, `Reasoning item`, `ReAct trajectory`, `Agent execution trace with ReAct-style intermediate steps`, `Tool calling / function calling`, `Computer use loop`, `Code Interpreter tool use`, `Tool observations` and `Final answer` headings as safe executable pre-response aliases. |
| Backend product labels | `formatTraceToolLabel()` now maps business tools to user-facing labels: `list_products`/`list products` -> `catálogo de produtos`, `get_settings`/`get settings` -> `configurações da conta`, `get_billing_status`/`get billing status` -> `status da assinatura`. |
| Frontend legacy normalization | `kloel-message-ui` now applies the same product-grade labels to structured live events and legacy persisted textual labels, so expanding old trace cards no longer exposes raw implementation names. |
| API proof | Chrome API proof `/tmp/kloel-chat-alias-label-api-proof-1.json` shows the latest persisted assistant message trace label as `Ação enviada para configurações da conta.` and the previous persisted tool trajectory still stored as raw labels before frontend normalization. |
| Browser proof | After reloading `http://app.root.localhost:3000/chat?conversationId=46f0973d-9c8a-43c9-9923-d026dbff1b12`, expanding the older 3-tool trace rendered `Ação enviada para catálogo de produtos`, `Observação recebida de configurações da conta` and `Observação recebida de status da assinatura`; snapshot saved at `/tmp/kloel-chat-expanded-legacy-business-trace-snapshot.txt`, screenshot at `/tmp/kloel-chat-expanded-legacy-business-trace-proof.png`. |
| Console/network proof | Chrome DevTools after the expanded-card proof returned `<no console messages found>`; network showed successful reload and real authenticated requests for `/products`, `/member-areas`, `/checkout/products`, `/auth/me`, `/billing/subscription` and `/kloel/threads`. |
| Validation commands | `npm --prefix backend test -- kloel-thread.helpers.spec.ts kloel-thinker.service.spec.ts` passed; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed; focused backend `npx eslint src/kloel/kloel-thread.helpers.ts src/kloel/kloel-thread.helpers.spec.ts src/kloel/kloel-thinker-think.helpers.ts src/kloel/kloel-thinker.service.spec.ts` passed; `npm --prefix frontend test -- kloel-message-ui.test.ts` passed (16 tests); `npm --prefix frontend run typecheck` passed; `npm --prefix frontend run build` passed; `npx eslint src/lib/kloel-message-ui.ts src/lib/__tests__/kloel-message-ui.test.ts` passed inside `frontend/`. |

## 2026-06-04 Kloel chat one-shot context and public trace sanitization addendum

| Item | Evidence |
| --- | --- |
| Composer context leak | Capability and linked-product context are now one-shot composer inputs. `createSendMessageHandler` preserves the selected `capability` and linked product in the accepted user-message metadata, then clears attachments, `linkedProduct` and `activeCapability` so the next message starts from the neutral composer state. |
| TDD evidence | `KloelDashboardView.test.tsx` first failed on a `search_web` + linked product send because `clearComposerContext` was never called; the focused dashboard/composer/message-ui suite now passes with the context reset locked by test. |
| Public trace sanitization | Backend proof lines now persist `Ação operacional: <safe label>` instead of `Capacidade: <raw-id>`. Stored `processingTrace[].tool` is also public-safe (`saúde operacional`) instead of raw `self.health`, while internal dispatch still uses the real tool id. |
| Frontend legacy safety | `kloel-message-ui` sanitizes older persisted `Capacidade: ...` lines and maps live or legacy trace tool labels to product-grade labels before rendering expanded trace cards. |
| Chrome proof | Real authenticated Chrome conversation `46f0973d-9c8a-43c9-9923-d026dbff1b12` exercised the `+` menu, selected `Buscar`, sent a message, and returned the composer to `Responder...`; snapshot saved at `/tmp/kloel-chat-after-search-send-one-shot-snapshot.txt`. The final health-tool proof is saved at `/tmp/kloel-chat-final-health-tool-trace-sanitized-snapshot.txt` and post-reload snapshot at `/tmp/kloel-chat-final-post-reload-snapshot.txt`. |
| API proof | `/tmp/kloel-chat-final-health-tool-trace-api-proof.json` reports `ok: true`, `status: 200`, latest assistant content `Saúde do Kloel: consultada... Ação operacional: saúde operacional`, trace tool `saúde operacional`, labels `Ação enviada para saúde operacional.` and `Observação recebida de saúde operacional.`, with forbidden raw-token hits all `false` for `Capacidade:`, `self.health`, `sales.create_pix`, `list_products`, `get_settings` and `get_billing_status`. |
| Console proof | After the chat input accessibility fix and a real Chrome reload, DevTools returned `<no console messages found>`. DOM proof confirmed `textarea#kloel-chat-composer-input` with `name="message"`, `aria-label="Mensagem para o Kloel"` and placeholder `Responder...`; snapshot saved at `/tmp/kloel-chat-final-a11y-input-snapshot.txt`. |
| Input a11y hardening | `KloelChatComposer` now exposes the main prompt textbox with a stable id/name/accessible label, removing the browser diagnostic without any visual change. |
| Validation commands | `npm --prefix frontend test -- KloelChatComposer.test.tsx KloelChatComposer.attachments.test.tsx KloelDashboardView.test.tsx kloel-message-ui.test.ts` passed (4 files, 31 tests); `npm --prefix frontend run typecheck` passed; focused frontend ESLint passed for the composer, dashboard test and message-ui files. `npm --prefix backend test -- kloel-thread.helpers.spec.ts` passed; `npm --prefix backend test -- guest-chat.action-intent.helpers.spec.ts` passed; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed; focused backend ESLint passed for the touched Kloel helper/spec files. |

## 2026-06-04 Kloel chat natural reasoning/runtime proof addendum

| Item | Evidence |
| --- | --- |
| Public operator response | `/brain/decide` product-list actions now return natural product-grade copy such as `Consultei seu catálogo real e não encontrei produtos cadastrados neste workspace.`, not `Acao "list_products" executada...`. |
| Deterministic tool synthesis | Deterministic Kloel tool results are synthesized through the AI provider when available before falling back to proof text, so the user-facing answer is model-authored from real observations rather than a hard-coded tool echo. |
| API read sanitizer | `/kloel/threads/:id/messages` sanitizes legacy assistant content, response versions, processing trace labels/tools and brain action metadata on read; raw ids like `self.health` and `list_products` are mapped to `saúde operacional` and `catálogo de produtos` before the client sees them. |
| Chrome API proof | Authenticated Chrome tab `http://app.root.localhost:3000/chat?conversationId=46f0973d-9c8a-43c9-9923-d026dbff1b12` fetched `/kloel/threads/.../messages` with no cache; proof saved at `/tmp/kloel-chat-thread-messages-final-clean-path-proof.json`. It reports `status: 200`, `messageCount: 22`, `assistantCount: 11`, `failingHits: []`; the only remaining `list_products` hit is in an old user-authored prompt and is intentionally not rewritten. |
| Browser visual proof | Snapshot `/tmp/kloel-chat-final-clean-ui-snapshot.txt` and screenshot `/tmp/kloel-chat-final-clean-ui-screenshot.png` captured the same authenticated chat after backend restart. |
| Touched files | `backend/src/kloel/kloel-thread.helpers.ts`, `backend/src/kloel/kloel-thread.helpers.spec.ts`, `backend/src/kloel/kloel-thread.controller-helpers.ts`, `backend/src/kloel/kloel-thinker-think.helpers.ts`, `backend/src/kloel/kloel-thinker.service.spec.ts`, `backend/src/kloel/mind/coordination/mind-runtime.helpers.ts`, `backend/src/kloel/mind/coordination/mind-runtime.service.ts`, `backend/src/kloel/mind/coordination/mind-runtime.helpers.spec.ts`, `backend/src/kloel/mind/coordination/mind-runtime.service.spec.ts`, `frontend/src/components/kloel/dashboard/KloelDashboard/useBrainRouter.ts`, `frontend/src/components/kloel/dashboard/KloelDashboardView.test.tsx`, `frontend/src/lib/kloel-message-ui.ts`, `frontend/src/lib/__tests__/kloel-message-ui.test.ts`. |
| Validation commands | `npm --prefix frontend test -- KloelChatComposer.test.tsx KloelChatComposer.attachments.test.tsx KloelDashboardView.test.tsx kloel-message-ui.test.ts` passed (4 files, 34 tests); `npm --prefix frontend run typecheck` passed; focused frontend ESLint passed for `useBrainRouter.ts`, dashboard test and message-ui files. `npm --prefix backend test -- kloel-thread.helpers.spec.ts --runInBand` passed; `npm --prefix backend run typecheck` passed; focused backend ESLint passed for the touched thread helper/controller files; `npm --prefix backend run build` passed; backend dist was restarted on port 3001 before Chrome proof. |
| Scope note | This closes the current chat reasoning/trace leakage slice. It does not claim the whole graph parity mission is complete. |


## 2026-06-04 Kloel composer capability routing addendum

| Item | Evidence |
| --- | --- |
| Dead mechanism found | Runtime proof showed a `create_site` composer turn was intercepted by generic action routing and emitted `tool_call: run_backend_tests` instead of the selected composer capability. Artifact: `/tmp/kloel-composer-capabilities-node-proof.json`. |
| Routing fix | `KloelThinkerService.think()` now treats an explicit composer capability as a strong UI intent: deterministic action detection is skipped when `composerCapability` is present, and the composer branch runs immediately after thread/context resolution, before ConversationState/ABI generic routing. |
| TDD evidence | Added regression `lets an explicit composer capability bypass generic action routing`; it failed first with `executeLocalTool(ws-1, run_backend_tests, {}, agent-1)`, then passed after the routing fix. |
| Runtime proof | After `npm --prefix backend run build` and restarting backend dist on port 3001, Node runtime proof with the Chrome tester bearer saved `/tmp/kloel-composer-create-site-after-fix-proof.json`: `status: 201`, `tool_call.tool: create_site`, `tool_result.tool: create_site`, `leaksRunBackendTests: false`. |
| Honest external blocker | Local environment lacks `ANTHROPIC_API_KEY` for site generation and OpenAI image key for image generation, so `create_site`/`create_image` now surface provider-setup errors through the correct capability path instead of silently running the wrong tool. |
| Chrome status | Chrome DevTools refreshed the tester token through real `/auth/refresh` (`/tmp/kloel-auth-refresh-proof-2.json`) and captured the current chat DOM/snapshot. Direct DevTools `fetch` to `localhost:3001` hit browser/CORS limitations after the backend accepted SSE requests, so the capability payload proof was taken with the same bearer/workspace via Node against the running backend. |
| Validation commands | `npm --prefix backend test -- kloel-thinker.service.spec.ts --runInBand` passed; `npm --prefix backend run typecheck` passed; focused backend ESLint passed for `src/kloel/kloel-thinker.service.ts` and `src/kloel/kloel-thinker.service.spec.ts`; `npm --prefix backend run build` passed. |

## 2026-06-04 Kloel conversational test routing and trace-label addendum

| Item | Evidence |
| --- | --- |
| Runtime defect reproduced | Clean Chrome proof showed a conversational prompt beginning with `Teste Codex:` incorrectly routed to `run_backend_tests` and rendered `Ação enviada para run backend tests.` in the executable pre-response. Snapshot before the fix: `/tmp/kloel-chat-trace-ui-after-enter.txt`. |
| Intent-router fix | `detectMetaCodeIntent()` no longer treats bare `teste` as a backend-test command. It now requires explicit operational wording such as `rodar testes`, `executar testes`, `testes do backend`, `npm test`, `jest` or `vitest`. |
| Trace-label hardening | Frontend live/persisted trace normalization and backend stored trace helpers now map `run_backend_tests` / `run backend tests` to `validação operacional`, so old or future raw events do not leak the internal tool id into the visible trace. |
| TDD evidence | `guest-chat.action-intent.helpers.spec.ts` first failed because the conversational prompt returned `{ tool: 'run_backend_tests' }`; `kloel-message-ui.test.ts` first failed because the label was `Ação enviada para run backend tests.`. Both pass after the fix. |
| API proof | After backend build and dist restart on port 3001, `/tmp/kloel-chat-conversational-test-after-fix-api-sse.json` reports `status: 201`, event types `thread/status/content/done`, `toolCalls: []`, and `leakMatches: []` for the same prompt. |
| Browser proof | Hard-reloaded clean Chrome chat at `http://app.root.localhost:3000/chat?codexProof=clean-after-action-router-fix-1780560427755`, sent the same prompt, and captured `/tmp/kloel-chat-clean-afterfix-final-snapshot.txt` plus `/tmp/kloel-chat-clean-afterfix-final-screenshot.png`. The snapshot contains the pre-response and final conceptual answer with no `run_backend_tests`, `run backend tests`, `code_outline`, `search_codebase`, `tool_call`, `tool_result`, or prior test-execution error. Composer state proof `/tmp/kloel-chat-clean-afterfix-composer-state.json` shows textarea and capabilities button enabled after completion. |
| Validation commands | `npm --prefix backend test -- guest-chat.action-intent.helpers.spec.ts kloel-thread.helpers.spec.ts --runInBand` passed; `npm --prefix backend run typecheck` passed; focused backend ESLint passed for touched Kloel intent/thread files; `npm --prefix backend run build` passed and backend dist was restarted. `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed (19 tests); `npm --prefix frontend run typecheck` passed; focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and its test. |

## 2026-06-04 Kloel conceptual pre-response parser addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | A conceptual answer about `Reasoning summary`, `Agent trace` and `ReAct trajectory` could be parsed as executable action headings, because aliases like `Agent trace` were accepted bare inside the final answer. Older proof showed the collapsed card claiming `Raciocínio resumido e ações antes da resposta final.` when no real action happened. |
| Parser fix | Executable pre-response headings now require an explicit separator unless the heading is one of the narrow bare Portuguese headings (`raciocínio`, `raciocínio resumido`, `ações`, `observações`, `resposta final`). Inline `--- **Resposta final** -` boundaries are supported, and no-op action/observation sections are ignored instead of producing fake trace entries. |
| TDD evidence | `kloel-thread.helpers.spec.ts` first failed for `**Raciocínio resumido** ... --- **Resposta final** - **Reasoning summary** ... - **Agent trace** ... - **ReAct trajectory** ...`; after the fix it stores only the real reasoning summary trace and keeps final-answer concepts in visible content. |
| API proof | `/tmp/kloel-chat-pre-response-parser-after-fix-api.json` reports `status: 201`, real `conversationId: 404e365e-1409-42e9-8e03-7409bd411714`, persisted roles `user/assistant`, `toolCalls: []`, `traceHasActionPhase: false`, no executable reasoning/final-answer heading in content, and `leakMatches: []`. |
| Browser proof | Authenticated Chrome tab sent the same regression prompt at `http://app.root.localhost:3000/chat?codexProof=parser-after-fix-1780562500000`. Final snapshot `/tmp/kloel-chat-parser-after-fix-final-snapshot.txt` and screenshot `/tmp/kloel-chat-parser-after-fix-final-screenshot.png` show the final answer without a trace card. Exact report `/tmp/kloel-chat-parser-after-fix-chrome-exact-report.json` reports no `PRÉ-RESPOSTA EXECUTÁVEL`, no trace `RACIOCÍNIO`, no trace `AÇÃO`, no `Ocultar` trace button, assistant answer present, and no raw tool leaks. |
| Network proof | Chrome DevTools network showed real authenticated `POST http://localhost:3001/kloel/think [201]`, `GET /kloel/threads [200]`, and `GET /kloel/threads/133085ce-dbd0-4d22-aaa6-f407acc6881e/messages [200]`; saved network artifacts were redacted before ledger reference. |
| Validation commands | `npm --prefix backend test -- kloel-thread.helpers.spec.ts --runInBand` passed; `cd backend && npx eslint src/kloel/kloel-thread.helpers.ts src/kloel/kloel-thread.helpers.spec.ts` passed; `npm --prefix backend test -- kloel-thinker.service.spec.ts --runInBand` passed; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed and backend dist was restarted on port 3001. |

## 2026-06-04 Kloel chat linked-product routing addendum

| Item | Evidence |
| --- | --- |
| Runtime defect reproduced | Selecting `Produto chat link 817635` in the real `+` menu then asking for product status previously routed through the generic sales detector and produced `PRÉ-RESPOSTA EXECUTÁVEL` with `get order details` followed by `Erro: Venda nao encontrada`. Proof before fix: `/tmp/kloel-chat-linked-product-wrong-routing-proof.json`. |
| Routing fix | `KloelThinkerService.think()` now extracts composer metadata before deterministic action detection and treats explicit UI context (`capability`, `linkedProduct` or attachments) as stronger intent than generic sales/action regexes. Product-linked chat turns therefore bypass `detectActionIntent()` and go through the normal model/composer context path. |
| TDD evidence | Added regression `lets an explicit linked product bypass generic sales action routing`; it failed first with `executeLocalTool(ws-1, get_order_details, { productName: 'sem expor ids internos.' }, agent-1)` and passed after the routing guard. |
| API proof | `/tmp/kloel-chat-linked-product-after-fix-api-proof.json` reports `status: 201`, `contentType: text/event-stream`, persisted `linkedProduct` metadata for `Produto chat link 817635`, `hasGetOrderDetails: false`, `hasVendaNaoEncontrada: false`, `hasExecutableToolEvent: false`, and assistant content confirming the product name/status. |
| Chrome proof | In authenticated Chrome at `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e`, the `+` menu exposed `Adicionar fotos e arquivos`, `Vincular Produto`, `Criar imagem`, `Criar site` and `Buscar`; selecting the real product displayed the top-rail link, sending the same regression prompt returned `Produto: Produto chat link 817635 Status: Inativo (workflow em rascunho)`. Snapshot: `/tmp/kloel-chat-linked-product-after-fix-final-snapshot.txt`; screenshot: `/tmp/kloel-chat-linked-product-after-fix-final-screenshot.png`; DOM report: `/tmp/kloel-chat-linked-product-after-fix-dom-report.json`. |
| Network proof | Chrome DevTools captured real authenticated `POST http://localhost:3001/kloel/think [201]` for the linked-product message. Redacted artifacts: `/tmp/kloel-chat-linked-product-after-fix-think.network-request` and `/tmp/kloel-chat-linked-product-after-fix-think.network-response`; the response stream contains only thread/status/content/done events and no tool call. |
| Validation commands | `npm --prefix backend test -- kloel-thinker.service.spec.ts --runInBand` passed; focused backend ESLint passed for `src/kloel/kloel-thinker.service.ts` and `src/kloel/kloel-thinker.service.spec.ts`; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed; backend dist was restarted on port 3001 before API and Chrome proof. |

## 2026-06-04 Kloel composer public capability-failure addendum

| Item | Evidence |
| --- | --- |
| Public setup wording | Composer setup failures for `search_web`, `create_site` and `create_image` now produce product-grade public replies: the capability is connected, but the environment setup is incomplete. Visible replies no longer mention provider names, keys, API key, LLM engine names, `ANTHROPIC`, `OPENAI`, raw tool ids or wrong sales/test tools. |
| Backend behavior | `runComposerCapabilityBranch()` now converts capability provider/setup failures into persisted assistant `content` plus `done`, instead of ending the SSE stream with only a terminal error. The structured trace still records the internal capability event for observability. |
| Trace labels | Backend `formatTraceToolLabel()` and frontend `kloel-message-ui` now render `create_site` as `criação de site` and `create_image` as `criação de imagem` in trace cards, matching the existing product-grade label layer. |
| API proof | `/tmp/kloel-composer-capabilities-after-public-wording-api-matrix.json` proves real authenticated `POST /kloel/think` calls for `search_web`, `create_site` and `create_image`: all returned `201`, `content-type: text/event-stream`, a `content` event, `done`, no terminal `error`, no `run_backend_tests`, no `get_order_details`, no `Venda nao encontrada`, and `assistantContentHasForbiddenSetupWords: false`. Raw SSE artifacts: `/tmp/kloel-composer-search_web-after-public-wording-api.raw.sse`, `/tmp/kloel-composer-create_site-after-public-wording-api.raw.sse`, `/tmp/kloel-composer-create_image-after-public-wording-api.raw.sse`. |
| Chrome proof: Criar site | Authenticated Chrome at `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` clicked the real `+` menu, selected `Criar site`, filled the real textarea and sent with the real button. DOM report `/tmp/kloel-chat-create-site-public-wording-dom-report.json` shows the latest slice has the public fallback, no raw tool name, no forbidden setup wording and no session-expired state. Snapshot: `/tmp/kloel-chat-create-site-public-wording-final-snapshot.txt`; screenshot: `/tmp/kloel-chat-create-site-public-wording-final-screenshot.png`. |
| Chrome proof: Buscar | The same authenticated Chrome chat clicked the real `+` menu, selected `Buscar`, filled the real textarea and sent with the real button. DOM report `/tmp/kloel-chat-search-web-public-wording-dom-report.json` shows the latest slice has the public search fallback, no raw tool name, no forbidden setup wording and no session-expired state. Snapshot: `/tmp/kloel-chat-search-web-public-wording-final-snapshot.txt`; screenshot: `/tmp/kloel-chat-search-web-public-wording-final-screenshot.png`. |
| Chrome proof: Criar imagem | The same authenticated Chrome chat clicked the real `+` menu, selected `Criar imagem`, filled the real textarea and sent with the real button. DOM report `/tmp/kloel-chat-create-image-public-wording-dom-report.json` shows the latest slice has the public image-generation fallback, no raw tool name, no forbidden setup wording and no session-expired state. Snapshot: `/tmp/kloel-chat-create-image-public-wording-final-snapshot.txt`; screenshot: `/tmp/kloel-chat-create-image-public-wording-final-screenshot.png`. |
| Network proof | Chrome DevTools captured real authenticated `POST /kloel/think [201]` streams for all three click paths. `Criar site`: reqid `436`, `/tmp/kloel-chat-create-site-public-wording-final2.network-request`, `/tmp/kloel-chat-create-site-public-wording-final2.network-response`, `/tmp/kloel-chat-create-site-public-wording-final2-network-report.json`. `Buscar`: reqid `445`, `/tmp/kloel-chat-search-web-public-wording.network-request`, `/tmp/kloel-chat-search-web-public-wording.network-response`, `/tmp/kloel-chat-search-web-public-wording-network-report.json`. `Criar imagem`: reqid `450`, `/tmp/kloel-chat-create-image-public-wording.network-request`, `/tmp/kloel-chat-create-image-public-wording.network-response`, `/tmp/kloel-chat-create-image-public-wording-network-report.json`. Each stream contains `thread/status/tool_call/tool_result/status/content/thread/done`, the expected capability tool, `hasDone: true`, `hasTerminalError: false`, and public content with no forbidden setup wording. |
| Validation commands | `npm --prefix backend test -- kloel-thinker.service.spec.ts kloel-composer.service.helpers.search.spec.ts kloel-thread.helpers.spec.ts mind-guards-composer.service.spec.ts --runInBand` passed; focused backend ESLint passed for the touched Kloel thinker/composer/thread/guard files; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed and backend dist was restarted. `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed; focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and its test. |
| Scope note | This closes the public failure and trace-label slice for the three current composer capabilities in the `+` menu: `Buscar`, `Criar site` and `Criar imagem`. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel chat upload sanitizer addendum

| Item | Evidence |
| --- | --- |
| Runtime defect reproduced | Real Chrome upload through the `+` menu succeeded, but the assistant reply rendered `Recebido. O camada internaexado foi confirmado.` because the streamed text sanitizer replaced the partial chunk `arquivo an` before the next chunk completed `exado`. This proved the bug was in visible-text sanitization, not the upload pipeline. |
| Sanitizer fix | Backend SSE/persistence sanitizer and frontend historical-message sanitizer now redact only path-like/file-like `arquivo ...` references while preserving ordinary user-facing wording such as `arquivo anexado`. Technical paths like `arquivo backend/src/kloel/x.ts` remain hidden. |
| Regression tests | Backend added direct and streamed-chunk regressions for `Recebido. O arquivo anexado foi confirmado.` and for `arquivo an` + `exado` split across SSE chunks. Frontend added a persisted-message sanitizer regression for the same public wording. |
| Chrome upload proof | Authenticated Chrome at `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` clicked the real `+` menu, selected `Adicionar fotos e arquivos`, uploaded `/tmp/kloel-chat-upload-sanitizer-after-fix.txt`, filled the real textarea and sent with the real send button. DOM report `/tmp/kloel-chat-upload-sanitizer-after-fix-dom-report.json` shows latest answer `Recebido. O arquivo anexado foi confirmado com sucesso.`, `hasBrokenJoinAfterPrompt: false`, `hasExpectedPhraseAfterPrompt: true`. Snapshot: `/tmp/kloel-chat-upload-sanitizer-after-fix-final-snapshot.txt`; screenshot: `/tmp/kloel-chat-upload-sanitizer-after-fix-final-screenshot.png`. |
| Network proof | Chrome DevTools captured real authenticated upload `POST /kloel/upload-chat [201]` as reqid `478` and real authenticated `POST /kloel/think [201]` as reqid `480`. Redacted artifacts: `/tmp/kloel-chat-upload-sanitizer-after-fix-upload.network-request`, `/tmp/kloel-chat-upload-sanitizer-after-fix-upload.network-response`, `/tmp/kloel-chat-upload-sanitizer-after-fix-think.network-request`, `/tmp/kloel-chat-upload-sanitizer-after-fix-think.network-response`; report `/tmp/kloel-chat-upload-sanitizer-after-fix-network-report.json` shows upload `success: true`, attachment count `1`, SSE event types `thread/status/status/status/content/thread/done`, content `Recebido. O arquivo anexado foi confirmado com sucesso.`, `hasDone: true`, `hasBrokenJoin: false`, `hasInternalPath: false`. |
| Touched files | `backend/src/kloel/kloel-stream-events.ts`, `backend/src/kloel/kloel-stream-events.spec.ts`, `frontend/src/lib/kloel-message-ui.ts`, `frontend/src/lib/__tests__/kloel-message-ui.test.ts`, `docs/ai/graph-functional-recovery.md`. |
| Validation commands | `npm --prefix backend test -- kloel-stream-events.spec.ts --runInBand` passed; `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed (21 tests); focused backend ESLint passed for `src/kloel/kloel-stream-events.ts` and `src/kloel/kloel-stream-events.spec.ts`; focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and its test; `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed; `npm --prefix backend run build` passed; backend dist was restarted on port 3001 before Chrome proof. |
| Scope note | This closes the current `+` menu attachment/upload wording regression. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel chat public-language sanitizer addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | Historical chat content could render `camada operacional interno` after public sanitization converted `código interno` through multiple replacement stages. The failed focused test reproduced the exact broken phrase before the final-order fix. |
| Sanitizer fix | `sanitizeAssistantVisibleContent()` now normalizes residual `camada operacional intern[ao]` after the final `arquitetura interna` to `camada operacional` replacement, so persisted assistant messages render product-grade Portuguese without exposing raw implementation language or broken grammar. |
| Regression test | `frontend/src/lib/__tests__/kloel-message-ui.test.ts` now asserts `Respondo sem expor código interno ou nomes de ferramentas.` renders as `Respondo sem expor camada operacional ou nomes de ferramentas.` while still preserving ordinary attachment wording and hiding path-like file references. |
| Chrome proof | Authenticated Chrome at `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` was reloaded after the frontend fix. DOM report `/tmp/kloel-chat-public-language-sanitizer-dom-report.json` shows `hasBrokenMasculine: false`, `hasBrokenFeminine: false`, `hasCleanedContext: true`, and the historical answer context contains `sem expor camada operacional ou nomes`. Snapshot: `/tmp/kloel-chat-public-language-sanitizer-snapshot.txt`; screenshot: `/tmp/kloel-chat-public-language-sanitizer-screenshot.png`. |
| Validation commands | `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed (21 tests); focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and `src/lib/__tests__/kloel-message-ui.test.ts`; `npm --prefix frontend run typecheck` passed. |
| Scope note | This closes the current public-language regression observed in the chat thread. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel chat raw sales-error sanitizer addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The authenticated Chrome snapshot of the real chat still rendered the historical assistant body `Erro: Venda nao encontrada` from an old wrong sales-tool route. This was a persisted visible-content leak, not a current routing failure. |
| Sanitizer fix | `sanitizeAssistantVisibleContent()` now converts `Erro: Venda nao encontrada` / `Venda não encontrada` into `Não encontrei uma venda correspondente para essa consulta.` before rendering historical assistant content. |
| Regression test | `frontend/src/lib/__tests__/kloel-message-ui.test.ts` extends the historical mechanical-failure fixture with `Erro: Venda nao encontrada` and asserts the public sentence appears while the raw error is absent. |
| Chrome proof | Authenticated Chrome at `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` was reloaded after the frontend fix. DOM report `/tmp/kloel-chat-sales-error-sanitizer-dom-report.json` shows `hasRawSalesError: false`, `hasVendaNaoEncontradaAnyCase: false`, `hasPublicSalesError: true`, with context rendering `Não encontrei uma venda correspondente para essa consulta.`. Snapshot: `/tmp/kloel-chat-sales-error-sanitizer-snapshot.txt`; screenshot: `/tmp/kloel-chat-sales-error-sanitizer-screenshot.png`. |
| Validation commands | `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed (21 tests); focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and `src/lib/__tests__/kloel-message-ui.test.ts`; `npm --prefix frontend run typecheck` passed. |
| Scope note | This closes the historical raw sales-error rendering defect. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel executable-trace sales-label addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | Expanding the historical `PRÉ-RESPOSTA EXECUTÁVEL` in authenticated Chrome showed raw labels `Ação enviada para get order details.` and `Falha observada em get order details.` inside the trace detail. |
| Trace-label fix | `formatTraceToolLabel()` now maps `get_order_details` and `get order details` to the public label `consulta de venda`, so persisted `tool_call` and `tool_result` entries render as product-grade trace steps. |
| Regression test | `frontend/src/lib/__tests__/kloel-message-ui.test.ts` adds a persisted executable-trace regression with `tool: 'get_order_details'`, asserting labels `Ação enviada para consulta de venda.` and `Falha observada em consulta de venda.` with no raw snake-case or spaced tool name. |
| Chrome proof | Authenticated Chrome reloaded and expanded the same trace in `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e`. DOM report `/tmp/kloel-chat-sales-trace-label-dom-report-after-wait.json` shows `hasRawSpaced: false`, `hasRawSnake: false`, `hasPublicLabel: true`, and context with both `Ação enviada para consulta de venda.` and `Falha observada em consulta de venda.`. Snapshot: `/tmp/kloel-chat-sales-trace-label-snapshot.txt`; screenshot: `/tmp/kloel-chat-sales-trace-label-screenshot.png`. |
| Validation commands | `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed (22 tests); focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and `src/lib/__tests__/kloel-message-ui.test.ts`; `npm --prefix frontend run typecheck` passed. |
| Scope note | This closes the expanded executable-trace raw sales-tool label defect. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel historical attachment-copy sanitizer addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The real chat still contained historical assistant copy `Recebido. O camada internaexado foi confirmado.` and `camada interna teste recebido e confirmado.` from turns generated before the stream sanitizer fix. |
| Sanitizer fix | `sanitizeAssistantVisibleContent()` now normalizes those two persisted attachment artifacts to `arquivo anexado` and `Arquivo de teste`, preserving the user-facing upload meaning without exposing internal placeholder wording. |
| Regression test | `frontend/src/lib/__tests__/kloel-message-ui.test.ts` extends the attachment sanitizer test with both historical broken strings and their expected public output. |
| Chrome proof | Authenticated Chrome reloaded `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e`. DOM report `/tmp/kloel-chat-historical-attachment-sanitizer-dom-report.json` shows `hasBrokenJoinedAttachment: false`, `hasBrokenTestAttachment: false`, `hasFixedJoinedAttachment: true`, `hasFixedTestAttachment: true`. Snapshot: `/tmp/kloel-chat-historical-attachment-sanitizer-snapshot.txt`; screenshot: `/tmp/kloel-chat-historical-attachment-sanitizer-screenshot.png`. |
| Validation commands | `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed (22 tests); focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and `src/lib/__tests__/kloel-message-ui.test.ts`; `npm --prefix frontend run typecheck` passed. |
| Scope note | This closes the historical broken attachment-copy rendering defect. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel historical create-site setup sanitizer addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The real chat still rendered an old assistant response for `Criar site` with `provedor de geração de sites` and `chave do provedor`, even though newer capability replies already use public setup wording. |
| Sanitizer fix | `sanitizeAssistantVisibleContent()` now converts that historical create-site setup sentence to the public wording `a configuração de geração de sites ainda não foi concluída... Finalize a configuração...`. |
| Regression test | `frontend/src/lib/__tests__/kloel-message-ui.test.ts` adds a persisted assistant response fixture for the old create-site setup copy and asserts the exact public sentence with no `provedor` or `chave`. |
| Chrome proof | Authenticated Chrome reloaded `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e`. DOM report `/tmp/kloel-chat-create-site-historical-setup-sanitizer-dom-report.json` shows `hasLegacyAssistantSetup: false`, `hasFixedAssistantSetup: true`; paragraph report `/tmp/kloel-chat-create-site-historical-setup-sanitizer-paragraph-report.json` shows `fixedParagraphCount: 2`, `legacyParagraphCount: 0`, `fixedParagraphsHaveProviderOrKey: false`. Snapshot: `/tmp/kloel-chat-create-site-historical-setup-sanitizer-snapshot.txt`; screenshot: `/tmp/kloel-chat-create-site-historical-setup-sanitizer-screenshot.png`. |
| Validation commands | `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed (23 tests); focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and `src/lib/__tests__/kloel-message-ui.test.ts`; `npm --prefix frontend run typecheck` passed. |
| Scope note | This closes the historical create-site setup wording leak. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel taxonomy PASS-token sanitizer addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | A full taxonomy prompt in the real chat produced a visible typo in the assistant answer: `Intermediate steps — alegação acima do observadoos intermediários.`. Root cause: the internal `PASS` sanitizer could catch `pass` at a hyphen boundary and historical content already contained the broken artifact. |
| Sanitizer fix | Frontend and backend `PASS` token regexes now reject `PASS` followed by hyphen/letter/number/underscore, and both sanitizers normalize persisted `alegação acima do observadoos` back to `passos`. Real isolated `PASS` status tokens remain redacted by existing tests. |
| Regression tests | Frontend `kloel-message-ui.test.ts` covers the persisted broken taxonomy sentence and `pass-os`; backend `kloel-stream-events.spec.ts` covers the same behavior before SSE/persistence. |
| Runtime/build proof | Focused frontend test passed (23 tests); backend `kloel-stream-events.spec.ts` passed; focused frontend and backend ESLint passed; `npm --prefix frontend run typecheck`, `npm --prefix backend run typecheck`, and `npm --prefix backend run build` passed. Backend dist was restarted cleanly on port 3001 after build. |
| Chrome proof | Authenticated Chrome reloaded `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` after the fix. DOM report `/tmp/kloel-chat-taxonomy-passos-sanitizer-dom-report.json` shows `missingTerms: []`, `hasBrokenPassos: false`, `hasCleanPassos: true`, `hasPassHyphenArtifact: false`, with context `Intermediate steps — passos intermediários...`. Snapshot: `/tmp/kloel-chat-taxonomy-passos-sanitizer-snapshot.txt`; screenshot: `/tmp/kloel-chat-taxonomy-passos-sanitizer-screenshot.png`. |
| Scope note | This closes the visible taxonomy answer typo and validates full concept coverage for the current chat prompt. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel Mesa de refinamento real addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The chat `+` menu had no real refinement capability for turning a rough answer into an executive response. Earlier fallback copy also exposed internal process wording such as `camada operacional`, `chamada a sistema`, `estado oculto da ferramenta`, and one persisted response rendered the bad grammar `acesso à processo privado`. |
| Capability fix | Added `refine_response` end to end: frontend composer capability metadata, visible `Mesa de refinamento` action/chip/icon, backend composer metadata whitelist, thinker branch typing, composer prompt builder, model execution through the central `createTextLlmClient` + `resolveBackendOpenAIModel('writer')`, usage tracking, and public fallback text. |
| Trace/public-language fix | Visible traces now label this capability as `mesa de refinamento`; live and persisted tool labels pass through the same public sanitizer. Frontend and backend read sanitizers convert internal process wording to public terms and fix `à processo privado` to `ao processo privado`. |
| Regression tests | Frontend covers the composer `+` menu button and metadata callback for `refine_response`, live/persisted trace labels, persisted processing summaries, and public sanitizer grammar. Backend covers composer metadata extraction, central LLM provider execution for `refine_response`, and read-side sanitizer grammar. |
| Chrome proof | Authenticated Chrome at `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` opened the real `+` menu, selected `Mesa de refinamento`, filled the real textarea, and sent with the real send button. Final snapshot `/tmp/kloel-refine-current-final.txt` shows the new user prompt plus a real assistant response with `1. Diagnóstico executivo`, `2. Lacunas e riscos`, `3. Versão refinada`, and `4. Próxima ação verificável`; no `camada operacional`, `chamada a sistema`, `estado oculto da ferramenta`, or `à processo privado` appears in the latest assistant block. Sanitized reload proof: `/tmp/kloel-refine-response-sanitized-grammar.txt`. |
| Backend proof | Backend dist restarted on port 3001 after build. Runtime log shows `kloel_think_stream_closed` for conversation `133085ce-dbd0-4d22-aaa6-f407acc6881e` with `durationMs=26995`, `aborted=false`, `clientDisconnected=false`, `errorCode=null`, followed by real `POST /kloel/think [201]` requestId `46a15d4a-825c-4bf7-b828-c389ea75d499` and body metadata `{ "capability": "refine_response" }`. Follow-up `GET /kloel/threads/.../messages [200]` and `GET /kloel/threads?limit=20 [200]` completed. |
| Validation commands | `npm --prefix frontend test -- src/components/kloel/dashboard/KloelChatComposer.test.tsx src/lib/__tests__/kloel-message-ui.test.ts` passed (31 tests); `npm --prefix backend test -- kloel.service.composer.helpers.spec.ts kloel-composer.service.spec.ts kloel-thread.helpers.spec.ts --runInBand` passed; `npm --prefix frontend run typecheck` passed; `npm --prefix backend run typecheck` passed; focused frontend ESLint passed for the composer/message files; focused backend ESLint passed for the composer/thinker/thread files; `npm --prefix frontend run build` passed; `npm --prefix backend run build` passed. |
| Touched files | `frontend/src/lib/kloel-chat.ts`, `frontend/src/components/kloel/dashboard/KloelChatComposerParts.tsx`, `frontend/src/components/kloel/dashboard/KloelChatComposer.test.tsx`, `frontend/src/lib/kloel-message-ui.ts`, `frontend/src/lib/__tests__/kloel-message-ui.test.ts`, `backend/src/kloel/kloel-composer.service.ts`, `backend/src/kloel/kloel-composer.service.helpers.ts`, `backend/src/kloel/kloel.service.composer.helpers.ts`, `backend/src/kloel/kloel-thinker.service.ts`, `backend/src/kloel/kloel-thinker.helpers.ts`, `backend/src/kloel/kloel-thinker-think.helpers.ts`, `backend/src/kloel/kloel-thread.helpers.ts`, and related specs. |
| Scope note | This closes the current Mesa de refinamento chat slice and proves one more real `+` menu mechanism. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel executable-trace persistence addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The `Mesa de refinamento` stream rendered `PRÉ-RESPOSTA EXECUTÁVEL` live, but the backend persisted the assistant message without `processingTrace` and `processingSummary`; after the frontend reloaded the conversation, the pre-response trace disappeared. Proof before fix: `/tmp/kloel-latest-messages-fetch.json` showed the latest assistant metadata keys only included capability/request transport fields and no processing trace. |
| Persistence fix | `runComposerCapabilityBranch()` now persists the accumulated trace entries for deterministic composer capabilities, builds `processingSummary` through `threadService.buildProcessingTraceSummary()`, writes both fields into assistant-message metadata, and emits the terminal `done` event with the same metadata. |
| Regression test | `backend/src/kloel/kloel-thinker.service.spec.ts` now passes a real `processingTraceEntries` array through the composer capability branch and asserts persistence plus `done` metadata include `processingTrace` and `processingSummary`. |
| Chrome proof | Authenticated Chrome at `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` selected `Mesa de refinamento`, sent the real textarea with the real send button, and reloaded the page. Snapshot `/tmp/kloel-persist-trace-after-browser-reload.txt` shows the latest user prompt plus persisted `PRÉ-RESPOSTA EXECUTÁVEL` and `Raciocínio resumido, 1 ação real e 1 observação antes da resposta final.` after browser reload. |
| API proof | `/tmp/kloel-latest-messages-after-browser-reload.json` reports `status: 200`, latest assistant id `0af79d1f-3b11-4bcc-9f50-71f472b4ba9d`, metadata keys `capability, clientRequestId, mode, processingSummary, processingTrace, refinementMode, replyToMessageId, requestState, transport`, trace length `2`, labels `Ação enviada para mesa de refinamento.` and `Observação recebida de mesa de refinamento.`. |
| Backend proof | Runtime log shows real authenticated `POST /kloel/think [201]` requestId `8a27fe62-00ab-4ff6-98f7-02327cd08fac` with metadata `{ "capability": "refine_response" }`, `kloel_think_stream_closed` with `aborted=false`, `clientDisconnected=false`, `errorCode=null`, and follow-up `GET /kloel/threads/133085ce-dbd0-4d22-aaa6-f407acc6881e/messages [200]` after reload. |
| Validation commands | `npm --prefix backend test -- kloel-thinker.service.spec.ts --runInBand` passed; `npm --prefix backend test -- kloel.service.composer.helpers.spec.ts kloel-composer.service.spec.ts kloel-thread.helpers.spec.ts kloel-thinker.service.spec.ts --runInBand` passed; focused backend ESLint passed for `src/kloel/kloel-thinker-think.helpers.ts` and `src/kloel/kloel-thinker.service.spec.ts`; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed; backend dist was restarted on port 3001 before the Chrome proof. |
| Scope note | This closes the trace-persistence defect for deterministic composer capabilities. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel executable-trace public-language addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The persisted `Mesa de refinamento` response kept the executable trace after reload, but public answer text could still say `ferramentas utilizadas` and `nomes de ferramentas`, which reads like operational/tool leakage in the visible chat. |
| Public-language fix | Frontend persisted-message sanitizer and backend stream/persistence sanitizer now convert `passos e ferramentas acionados` to `passos e ações executadas`, `ferramentas utilizadas` to `ações executadas`, `ferramentas acionadas/acionados` to `ações acionadas`, and `nomes de ferramentas` to `nomes internos de capacidades`. The refinement prompt now explicitly instructs public wording: actions, observations and capabilities, while preserving explicit taxonomy wording such as `Tool/function calling` when the user asks for it. |
| Regression tests | Frontend `kloel-message-ui.test.ts` asserts the public replacements and verifies `Tool/function calling — capacidade de invocar ferramentas ou funções externas.` remains unchanged. Backend `kloel-stream-events.spec.ts` asserts the same stream-side sanitizer behavior, and `kloel-composer.service.spec.ts` asserts the refinement prompt includes `ações executadas`, blocks `ferramentas utilizadas`, and preserves the explicit taxonomy exception. |
| Chrome proof: historical persisted answer | Authenticated Chrome reloaded `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` after the frontend/backend fix. Snapshot `/tmp/kloel-public-language-after-sanitizer-reload.txt` shows the previously persisted response now rendering `ações executadas` and `nomes internos de capacidades`, with no `ferramentas utilizadas`, no `nomes de ferramentas`, no raw `tool_call`/`tool_result`, and no provider/env leakage in assistant-visible text. |
| Chrome proof: new real Mesa message | In the same authenticated Chrome chat, I opened the real `+` capabilities menu, selected `Mesa de refinamento`, typed into the real textarea, and clicked the real `Enviar mensagem` button. Backend log shows real `POST /kloel/think [201]` requestId `60b016c8-eb9c-4f6a-a83b-9ba248538727`, metadata `{ "capability": "refine_response" }`, `kloel_think_stream_closed` with `aborted=false`, `clientDisconnected=false`, `errorCode=null`, then `GET /kloel/threads/.../messages [200]`. Snapshot `/tmp/kloel-public-language-new-message-final.txt` shows the newly generated response with `PRÉ-RESPOSTA EXECUTÁVEL`, `Raciocínio resumido, 1 ação real e 1 observação antes da resposta final.`, `Reasoning summary`, `Agent trace: registro sequencial de ações executadas e observações obtidas`, and `ReAct trajectory`; the forbidden strings appear only inside the user's negative test prompt, not in the assistant response. |
| Chrome proof: persistence and console | After a browser reload, snapshot `/tmp/kloel-public-language-new-message-after-reload.txt` shows the new message persisted with the same `PRÉ-RESPOSTA EXECUTÁVEL` summary and public final answer. Instrumented reload captured no new page errors in `/tmp/kloel-captured-react-errors.json`, and current Chrome console query returned no warnings/errors. Final clean-console snapshot: `/tmp/kloel-public-language-final-current-clean-console.txt`. |
| Validation commands | `npm --prefix frontend test -- src/lib/__tests__/kloel-message-ui.test.ts` passed (24 tests); `npm --prefix backend test -- kloel-stream-events.spec.ts kloel-composer.service.spec.ts --runInBand` passed; focused frontend ESLint passed for `src/lib/kloel-message-ui.ts` and its test; focused backend ESLint passed for `src/kloel/kloel-stream-events.ts`, `src/kloel/kloel-stream-events.spec.ts`, `src/kloel/kloel-composer.service.helpers.ts`, and `src/kloel/kloel-composer.service.spec.ts`; `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed; `npm --prefix backend run build` passed; backend dist restarted on port 3001 before Chrome validation. |
| Scope note | This closes the current public-language leak inside executable trace/refinement responses. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Kloel Mesa markdown/read persistence addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | A real `Mesa de refinamento` response could stream with usable Markdown, but persisted/read-side content was flattened by `sanitizeAssistantThreadContentForRead()` because it collapsed all whitespace with a global whitespace regex. After reload, sections like `Diagnóstico executivo`, `Lacunas e riscos`, `Versão refinada` and `Próxima ação verificável` could merge into oversized headings/paragraphs, damaging the perceived reasoning quality. |
| Read/persistence fix | `sanitizeAssistantThreadContentForRead()` now preserves Markdown line breaks while still normalizing inline whitespace and excess blank lines. `persistAssistantThreadMessage()` normalizes `refine_response` assistant Markdown before writing to `ChatMessage` and the dual-write thread mind record, so Mesa content is clean at both stream/persistence and read boundaries. |
| Regression tests | `kloel-thread.helpers.spec.ts` covers Markdown line-break preservation through the read sanitizer. `kloel-thread.service.spec.ts` covers pre-write normalization for `capability: 'refine_response'`. Existing composer/thinker tests now also cover `*` and `-` bullets plus SSE/persistence-boundary normalization. |
| Chrome proof | Authenticated Chrome at `http://app.root.localhost:3000/chat?conversationId=133085ce-dbd0-4d22-aaa6-f407acc6881e` opened the real `+` menu, selected `Mesa de refinamento`, sent through the real textarea/button, then reloaded the page. Current screenshot `/tmp/kloel-explicit-refine-post-reload.png` and snapshot `/tmp/kloel-explicit-refine-post-reload.snapshot.txt` show persisted `PRÉ-RESPOSTA EXECUTÁVEL` plus separated Markdown headings for `Diagnóstico executivo`, `Lacunas e riscos`, `Versão refinada`, nested public heading text, and `Próxima ação verificável`. Chrome console after reload had no `error` or `warn` messages. |
| Backend/DB proof | Runtime log shows real `POST /kloel/think [201]` requestId/correlationId `f25271ec-3b77-4414-b133-6f263b779163`, conversation `133085ce-dbd0-4d22-aaa6-f407acc6881e`, metadata `{ "capability": "refine_response" }`, and `kloel_think_stream_closed` with `aborted=false`, `clientDisconnected=false`, `errorCode=null`. Direct Prisma read of latest assistant id `a0c91e0f-a647-4064-9a69-db1b7508aa4f` confirmed `metadata.capability=refine_response`, `hasProcessingTrace=true`, `processingSummary="Raciocínio resumido, 1 ação real e 1 observação antes da resposta final."`, `hasDiagBreak=true`, `hasLacunasBreak=true`, `hasVersaoBreak=true`, `hasProximaBreak=true`, `noGiantHeadingDiag=true`, `hasLineBullets=true`, and no raw internal tool names. |
| Validation commands | `npm --prefix backend test -- kloel-thread.helpers.spec.ts kloel-thread.service.spec.ts kloel-composer.service.helpers.search.spec.ts kloel-composer.service.spec.ts kloel-thinker.service.spec.ts --runInBand` passed; focused backend ESLint passed for the changed thread/composer/thinker files and specs; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed; backend dist restarted on port 3001 before Chrome validation. |
| Touched files | `backend/src/kloel/kloel-thread.helpers.ts`, `backend/src/kloel/kloel-thread.helpers.spec.ts`, `backend/src/kloel/kloel-thread.service.ts`, `backend/src/kloel/kloel-thread.service.spec.ts`, `backend/src/kloel/kloel-composer.service.helpers.ts`, `backend/src/kloel/kloel-composer.service.helpers.search.spec.ts`, `backend/src/kloel/kloel-composer.service.ts`, `backend/src/kloel/kloel-composer.service.spec.ts`, `backend/src/kloel/kloel-thinker-think.helpers.ts`, `backend/src/kloel/kloel-thinker.service.spec.ts`, `docs/ai/graph-functional-recovery.md`. |
| Scope note | This closes the current Mesa Markdown/read-persistence defect and proves the explicit refine-response capability in Chrome after reload. The broader KloelGraph parity mission remains active. |

## 2026-06-04 Perfil personal/fiscal browser-proof addendum

| Item | Evidence |
| --- | --- |
| Personal browser proof | Authenticated Chrome at `http://app.root.localhost:3000/settings?section=pessoal` opened the real `Minha conta` overlay from the graph node `Pessoal`. The date-of-birth control opened a real day/month/year pop-up with no time field; selected `15/05/1990`, filled phone `11999998888`, clicked real `Salvar alteracoes`, and got `Salvo!`. Network proof: `PUT http://localhost:3001/kyc/profile [200]` requestId `b765fa12-f206-4c55-b865-3e7256daf1ee`, request body `/tmp/kloel-profile-personal-save-request.network-request` with `{ "phone": "11999998888", "birthDate": "1990-05-15" }`, response `/tmp/kloel-profile-personal-save-response.network-response` with `birthDate="1990-05-15T00:00:00.000Z"`. After reload, opening the picker showed day `15`, month `05 - Maio`, year `1990`, and the phone remained persisted. |
| Fiscal CNPJ proof | Authenticated Chrome at `http://app.root.localhost:3000/settings?section=fiscal` opened the real fiscal overlay, switched to `Pessoa Juridica (CNPJ)`, filled public CNPJ `00000000000191`, and the real lookup populated `BANCO DO BRASIL SA`, `DIRECAO GERAL`, public responsible data and the official address. Network proof: `GET http://localhost:3001/kyc/lookup/cnpj/00000000000191 [200]` response `/tmp/kloel-profile-fiscal-cnpj-response.network-response` contains `razao_social="BANCO DO BRASIL SA"`, `nome_fantasia="DIRECAO GERAL"`, `cep="70040912"`, `logradouro="SAUN QUADRA 5 BLOCO B TORRE I, II, III"`, `municipio="BRASILIA"`, `uf="DF"`. |
| Fiscal CEP proof | In the same real overlay, changing CEP to `01001000` and blurring the field called `GET http://localhost:3001/kyc/lookup/cep/01001000 [200]`; response `/tmp/kloel-profile-fiscal-cep-response.network-response` contains `Praça da Sé`, `Sé`, `São Paulo`, `SP`, and the UI fields updated accordingly. |
| Fiscal persistence proof | Filled responsible CPF `12345678909`, number `100`, clicked real `Salvar alteracoes`, and got `Salvo!`; network proof: `PUT http://localhost:3001/kyc/fiscal [200]` requestId `42a4d9b0-5e87-445e-bd3e-17121b6e0ea9`, request body `/tmp/kloel-profile-fiscal-save-request.network-request`, response `/tmp/kloel-profile-fiscal-save-response.network-response` with `type="PJ"`, `cnpj="00000000000191"`, `razaoSocial="BANCO DO BRASIL SA"`, `nomeFantasia="DIRECAO GERAL"`, `responsavelCpf="12345678909"`, `cep="01001000"`, `street="Praça da Sé"`, `number="100"`, `city="São Paulo"`, `state="SP"`. After reload, snapshot `/tmp/kloel-profile-fiscal-persisted-after-reload.snapshot.txt` and screenshot `/tmp/kloel-profile-fiscal-persisted-after-reload.png` show all persisted fields in the graph overlay. |
| Console proof | Current Chrome console query after reload returned no `error` or `warn` messages. |
| Scope note | This removes the pending browser-validation gap for Perfil Pessoal date picker/profile save and Perfil Fiscal CNPJ/CEP/save persistence. Team/apps/docs/bank/security browser proof and the broader KloelGraph parity mission remain active. |

## 2026-06-04 Perfil bank selector accessibility/persistence addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | Perfil Banco already loaded and saved real backend data, but the bank selector button kept a fixed accessible name `Selecionar banco` after a bank was selected. Focused red test proved the defect: the visual text was `260 - Nu Pagamentos S.A.`, while the button name stayed `Selecionar banco`. |
| Fix | `ContaBankSelectorField` now derives the button accessible name from `formBankCode` + `formBankName`, e.g. `Banco selecionado: 001 Banco do Brasil S.A.`, while preserving the existing visual control and dropdown behavior. |
| Regression test | `frontend/src/components/kloel/conta/ContaDadosBancariosSection.test.tsx` now asserts the selector button is named with the selected real Brazilian bank after registry selection. The same focused test still verifies `updateBank()` receives `bankCode`, `bankName`, agency, account, holder name and holder document. |
| Browser proof | Authenticated Chrome reloaded `http://app.root.localhost:3000/settings?section=bancario` after the fix. Snapshot `/tmp/kloel-profile-bank-selector-after-fix.snapshot.txt` shows `button "Banco selecionado: 001 Banco do Brasil S.A."`, bank code `001`, agency `1234`, account `1234567-8`, holder `BANCO DO BRASIL SA`, holder document `00000000000191`, PIX key `00000000000191`, and PIX type `CNPJ` after reload. Screenshot: `/tmp/kloel-profile-bank-selector-after-fix.png`. |
| Backend proof | The previous real save request in the same authenticated session hit `PUT http://localhost:3001/kyc/bank [200]` requestId `b60aaa34-ac66-4b5a-9ace-9b95a7070e78`; `/tmp/kloel-profile-bank-save-request.network-request` contains `bankName="Banco do Brasil S.A."`, `bankCode="001"`, `agency="1234"`, `account="1234567-8"`, `pixKeyType="CNPJ"`; `/tmp/kloel-profile-bank-save-response.network-response` returns the same persisted bank payload with `displayAccount="****67-8"`. Reload network loaded `/kyc/banks`, `/kyc/bank`, profile/fiscal/status and graph data from the real backend/cache. |
| Console proof | Current Chrome console query after reload returned no `error`, `warn`, or `issue` messages. |
| Validation commands | Red test failed first for the fixed accessible name; after the fix, `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosBancariosSection.test.tsx` passed; focused ESLint passed for `ContaBankSelectorField.tsx` and `ContaDadosBancariosSection.test.tsx`; `npm --prefix frontend run typecheck` passed. |
| Scope note | This closes the Perfil Banco selected-bank feedback/accessibility gap while preserving the existing visual design. Docs/team/apps/security browser proof and the broader KloelGraph parity mission remain active. |

## 2026-06-04 Perfil documents upload/delete browser-proof addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The document upload zones called the real mutation through hidden file inputs, but the visible drop/click zones were plain `div`s with no button role/name in the browser a11y tree. After a real upload, the pending-document delete button was also an icon-only button with an empty accessible name. |
| Fix | `ContaDocumentosSection.UploadZone` now exposes empty upload zones as keyboard-focusable buttons named `Enviar <documento>`, preserving the existing visual layout. Pending document delete buttons are now named `Excluir <fileName>` while keeping the same icon-only visual treatment. |
| Regression tests | `frontend/src/components/kloel/conta/ContaDocumentosSection.test.tsx` now covers accessible upload-zone buttons, pending-document delete action naming, real document upload mutation path, and PJ second-slot switching to company documents. |
| Upload proof | Authenticated Chrome at `http://app.root.localhost:3000/settings?section=documentos` reloaded the graph overlay after the fix. Snapshot showed buttons `Enviar Documento de identidade` and `Enviar Contrato social ou cartao CNPJ`. A real `File` was injected into the screen's actual file input, dispatching the component `onChange`; network hit `POST http://localhost:3001/kyc/documents/upload [201]` requestId `48eda929-692c-412b-b1ac-568141fc8993`. Request body `/tmp/kloel-profile-documents-upload-request.network-request` contains `filename="codex-doc-proof-1780576138424.pdf"`, `Content-Type: application/pdf`, and `type=DOCUMENT_FRONT`. Response `/tmp/kloel-profile-documents-upload-response.network-response` returns `id="a3d0d1d1-8ef7-428c-9b38-a7bfe2292204"`, `type="DOCUMENT_FRONT"`, `fileName="codex-doc-proof-1780576138424.pdf"`, `fileSize=45`, `mimeType="application/pdf"`, `status="pending"`. |
| Persistence proof | After a browser reload, snapshot `/tmp/kloel-profile-documents-upload-after-reload.snapshot.txt` and screenshot `/tmp/kloel-profile-documents-upload-after-reload.png` show the persisted file `codex-doc-proof-1780576138424.pdf`, date `04/06/2026`, status `Pendente`, and button `Excluir codex-doc-proof-1780576138424.pdf`. |
| Delete proof | Clicking the real named delete button hit `DELETE http://localhost:3001/kyc/documents/a3d0d1d1-8ef7-428c-9b38-a7bfe2292204 [200]` requestId `1fa0befd-664a-4e86-ba51-5c251f6c480e`; response `/tmp/kloel-profile-documents-delete-response.network-response` is `{ "success": true }`. The follow-up `GET /kyc/documents [200]` refetched the list, and snapshot `/tmp/kloel-profile-documents-after-delete.snapshot.txt` plus screenshot `/tmp/kloel-profile-documents-after-delete.png` show the empty accessible upload buttons restored. |
| Console proof | Current Chrome console query after upload/delete returned no `error`, `warn`, or `issue` messages. |
| Validation commands | Red test failed first for missing upload-zone buttons; later red test failed for empty delete-button name. After fixes, `npm --prefix frontend test -- src/components/kloel/conta/ContaDocumentosSection.test.tsx` passed (4 tests); focused ESLint passed for `ContaDocumentosSection.tsx` and its test; `npm --prefix frontend run typecheck` passed. |
| Scope note | This closes Perfil Documentos upload visibility, real upload, persistence, accessible delete and real delete for the tester account. Team/apps/security browser proof and the broader KloelGraph parity mission remain active. |

## 2026-06-04 Perfil security MFA cancel/persistence addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The real security screen could start MFA setup and render a pending QR code, but pending setup had no verified cancel path in the graph overlay. Backend disable also accepted an empty body even for active MFA, which would let a missing-code disable request pass instead of preserving the active-2FA contract. |
| Backend fix | `POST /kyc/security/mfa/disable` now accepts an optional code only for pending setup cancellation. Active MFA still requires a 6-digit authenticator code and returns the existing bad-request path when the code is absent. Pending setup cancellation clears MFA state and refetches security data. |
| Frontend fix | `ContaSegurancaSection` now shows a real `Cancelar configuracao 2FA` action when `pendingSetup` or QR data is present. The action calls `disableMfa()` with an empty body, clears local QR/code state, refetches KYC security state, and preserves the existing visual layout. The sessions panel and revoke actions remain connected through the real KYC security payload. |
| Regression tests | Backend service spec covers cancelling pending setup without a code and requiring a code for active MFA disable. Backend controller spec covers delegation of an empty disable body. Frontend security-section spec covers cancelling pending setup without requiring an authenticator code, session rendering/revoke behavior, and the existing setup/verify flow. |
| Chrome proof: setup | Authenticated Chrome at `http://app.root.localhost:3000/settings?section=seguranca` opened the real graph `Seguranca` overlay and clicked the real `Configurar 2FA` button. UI rendered `Configuracao 2FA pendente`, QR image, `Codigo 2FA`, `Reabrir QR code`, `Cancelar configuracao 2FA`, and `Confirmar 2FA`. Network proof: `POST http://localhost:3001/kyc/security/mfa/setup [201]` then `GET http://localhost:3001/kyc/security [200]`. Snapshot `/tmp/kloel-profile-security-mfa-pending-cancel-button.snapshot.txt`; screenshot `/tmp/kloel-profile-security-mfa-pending-cancel-button.png`. The setup response body was intentionally not recorded because it contains the otpauth secret. |
| Chrome proof: cancel | Clicking the real `Cancelar configuracao 2FA` button hit `POST http://localhost:3001/kyc/security/mfa/disable [201]` with request body `{}` and response `{ "mfa": { "enabled": false, "pendingSetup": false } }`, followed by `GET /kyc/security [200]`. Request file: `/tmp/kloel-profile-security-mfa-cancel-request.network-request`; response file: `/tmp/kloel-profile-security-mfa-cancel-response.network-response`. UI returned to `2FA inativo nesta conta` with `Configurar 2FA`. Snapshot `/tmp/kloel-profile-security-mfa-cancel-after-click.snapshot.txt`; screenshot `/tmp/kloel-profile-security-mfa-cancel-after-click.png`. |
| Persistence proof | After browser reload with cache ignored, graph security overlay still showed `2FA inativo nesta conta`, `Configurar 2FA`, and no pending QR/cancel action. Reload network included `GET http://localhost:3001/kyc/security [304]` plus the surrounding real account/product/member-area fetches. Snapshot `/tmp/kloel-profile-security-mfa-cancel-after-reload.snapshot.txt`; screenshot `/tmp/kloel-profile-security-mfa-cancel-after-reload.png`. |
| Console proof | Chrome console query after setup/cancel/reload returned no `error` or `warn` messages. |
| Validation commands | `npm --prefix frontend test -- src/components/kloel/conta/ContaSegurancaSection.test.tsx` passed; focused frontend ESLint passed for `ContaSegurancaSection.tsx`, its spec, `useKyc.ts`, and `lib/api/kyc.ts`; `npm --prefix frontend run typecheck` passed. Backend red/green was verified for `kyc.service.spec.ts`; final `npm --prefix backend test -- kyc.service.spec.ts kyc.controller.spec.ts --runInBand` passed; focused backend ESLint passed for the changed KYC DTO/controller/service/spec/helper and `test/expect-value-of.ts`; `npm --prefix backend run typecheck` passed; `npm --prefix backend run build` passed; backend dist was restarted on port 3001 before the Chrome proof. |
| Touched files | `backend/src/kyc/dto/mfa.dto.ts`, `backend/src/kyc/kyc.controller.ts`, `backend/src/kyc/kyc.service.ts`, `backend/src/kyc/kyc.controller.spec.ts`, `backend/src/kyc/kyc.service.spec.ts`, `backend/src/kyc/kyc.service.spec.helpers.ts`, `backend/test/expect-value-of.ts`, `frontend/src/components/kloel/conta/ContaSegurancaSection.tsx`, `frontend/src/components/kloel/conta/ContaSegurancaSection.test.tsx`, `frontend/src/hooks/useKyc.ts`, `frontend/src/lib/api/kyc.ts`, `docs/ai/graph-functional-recovery.md`. |
| Scope note | This closes the Perfil Seguranca 2FA pending-cancel and persistence gap for the tester account. Team/apps, remaining integrations and the broader KloelGraph parity mission remain active. |

## 2026-06-04 Perfil team role/remove browser-proof and response-sanitization addendum

| Item | Evidence |
| --- | --- |
| Runtime defect isolated | The real graph overlay for Perfil > Equipe could create/accept/update/remove members, but Chrome proof showed `POST /team/accept-invite` and `DELETE /team/member/:id` returned the raw Prisma `Agent` record, including the internal `password` hash. This was a backend truth defect, not a visual defect. |
| Backend fix | `TeamService.acceptInvite()` and `TeamService.removeMember()` now call Prisma with a public `select` containing only `id`, `name`, `email` and `role`. `updateMemberRole()` already used the same safe public response shape. |
| Frontend fix | `ContaTeamSection` now exposes the active-member role selector as a real named control (`team-role-<id>`), calls `updateMemberRole()` through the real team API, shows mutation state, and names destructive buttons as `Remover <member>` for accessible and testable UI. |
| Regression tests | Red backend tests first failed because `agent.create` and `agent.delete` were called without `select`. After the fix, `npm --prefix backend test -- team.service.spec.ts team.service.remove-member.spec.ts --runInBand` passed. Frontend `ContaTeamSection.test.tsx` covers real role update and member removal callbacks through the section UI. |
| Chrome proof: accept invite | In authenticated Chrome at `http://app.root.localhost:3000/settings?section=equipe&graph=1`, browser fetch using the tester session created invite `codex-team-sanitized-1780585012766@example.com` and accepted it through `POST http://localhost:3001/team/accept-invite [201]`. Proof file `/tmp/kloel-team-accept-after-sanitize.json` shows accepted member `fa283559-6ac1-4cc6-ae65-dbeb3f15eb1f`, keys `["email","id","name","role"]`, and `acceptHasPassword=false`. |
| Chrome proof: graph overlay role update | Clicking the real graph node `Abrir Equipe` opened the real `Minha conta` overlay. Snapshot `/tmp/kloel-team-after-accept-sanitized.snapshot.txt` plus live a11y tree showed `Codex Sanitized Team`, combobox `Funcao de Codex Sanitized Team`, and button `Remover Codex Sanitized Team`. Changing the role selector hit `PATCH http://localhost:3001/team/member/fa283559-6ac1-4cc6-ae65-dbeb3f15eb1f/role [200]`; request `/tmp/kloel-team-role-after-sanitize-request.network-request` is `{ "role": "MEMBER" }`, response `/tmp/kloel-team-role-after-sanitize-response.network-response` contains only `id/name/email/role`, and UI proof `/tmp/kloel-team-role-ui-after-sanitize.json` shows the named selector value changed to `MEMBER`. |
| Chrome proof: graph overlay removal | Clicking the real `Remover Codex Sanitized Team` button with confirm accepted hit `DELETE http://localhost:3001/team/member/fa283559-6ac1-4cc6-ae65-dbeb3f15eb1f [200]`; response `/tmp/kloel-team-remove-after-sanitize-response.network-response` contains only `id/name/email/role`, and UI proof `/tmp/kloel-team-remove-ui-after-sanitize.json` shows `stillVisible=false` after refetch. |
| Console proof | Chrome console after the Team flow showed no product errors; only the existing Next warning about `scroll-behavior: smooth` on `<html>`. |
| Validation commands | `npm --prefix backend test -- team.service.spec.ts team.service.remove-member.spec.ts --runInBand` passed; `npm --prefix frontend test -- src/components/kloel/conta/ContaDadosPessoaisSection.test.tsx src/components/kloel/conta/ContaDadosFiscaisSection.test.tsx src/components/kloel/conta/ContaDocumentosSection.test.tsx src/components/kloel/conta/ContaDadosBancariosSection.test.tsx src/components/kloel/conta/ContaSegurancaSection.test.tsx src/components/kloel/conta/ContaTeamSection.test.tsx` passed (6 files, 12 tests); `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed; focused backend/frontend ESLint passed; `npm --prefix backend run build` passed; backend dist restarted on port 3001 before Chrome proof. |
| Touched files | `frontend/src/components/kloel/conta/ContaTeamSection.tsx`, `frontend/src/components/kloel/conta/ContaTeamSection.test.tsx`, `backend/src/team/team.service.ts`, `backend/src/team/team.service.spec.ts`, `backend/src/team/team.service.remove-member.spec.ts`, `docs/ai/graph-functional-recovery.md`. |
| Scope note | This closes the Perfil Equipe role-update/remove/persistence/security-response gap for the tester account. Apps/OAuth and the broader product/performance/graph-state sweep remain active. |

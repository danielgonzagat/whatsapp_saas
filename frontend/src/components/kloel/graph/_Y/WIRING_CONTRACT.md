# WIRING_CONTRACT — KloelGraph literal seam, node→data, overlay→component

> The binding contract for re-aiming Y. Read with `Y_PARTITION.md`. Line offsets
> are from the **complete literal** (`KloelGraphPrototype.jsx` 6576 lines in
> `whatsapp_saas-kg` / `docs/ai/assets/kloelgraph-harness.html` 6593 lines).
> The 671-line `.jsx` in this checkout is the **data-only partial** (ends mid
> `buildWalletNodesEdges`) — do NOT use it as source for engine/screens.

---

## A. Decomposition / seam — how the monolith splits (Fase 0, S0)

The literal is ONE file. S0 carves it into per-domain modules so that, after S0,
each galaxy edits a small module body, not the shared seam.

### A.1 Target tree (created in S0)

```
frontend/src/components/kloel/graph/
├── engine/
│   ├── KloelGraphEngine.ts        # PURE: buildGraph@924, applyFilters@1094,
│   │                              #   computeLayout@1118, computeGalaxyAnchors@1188,
│   │                              #   nodeRadius@1218, physicsTick@1223
│   └── KloelGraphCanvas.tsx       # GraphCanvas@3968, FloatingNav@4281,
│                                  #   SettingsPanel@3902, ThemeToggle@4271,
│                                  #   THEMES/ThemeProvider/FONT/MONO@12-53
├── overlays/
│   ├── KloelGraphOverlayChrome.tsx# KloelOverlay@5796 (modal chrome)
│   └── KloelGraphNodePanel.tsx    # NodePanel@4441 (ROUTER by node.type) +
│                                  #   AppNodePanel@3886 + KloelOverlayRouter@6077 +
│                                  #   CoreSettingsPanel@5258; uses SCREEN_BY_TYPE map
├── state/
│   └── useKloelGraphState.ts      # KloelInner@6287 root state (products/channels/
│                                  #   accountData/affiliate/wallet/educar/conversar/
│                                  #   desempenhoData/kloel + patch*) +
│                                  #   dynamicGraph=buildGraph(...)@6392
├── seeds/
│   ├── KloelGraph.seeds.ts        # BASE_SUNS@544, STATIC_BRANCHES@554, PRODUCTS@222,
│   │                              #   all *_SEED arrays
│   ├── KloelGraph.builders.ts     # build{Product,Affiliate,Educar,Conversar,
│   │                              #   Profile,Wallet}NodesEdges@300-653
│   └── KloelGraph.domain-constants.ts # CHANNEL_META@58, PRODUCT_NERVE_TABS@76,
│                                  #   AFFILIATE_BRANCHES@337, CONVERSAR_BRANCHES@432,
│                                  #   CRM_MODULES@435, WALLET_BRANCHES@628,
│                                  #   PROFILE_SECTIONS@559, TAB_SUN@325, defaults
├── domains/
│   ├── perfil/   (S1)  builder body + screens + perfil.data.ts
│   ├── kloel/    (S2)  KloelKloelDomain.module.tsx + kloel-domain.data-adapter.ts
│   ├── criar/    (S3)  product-nodes body + (opt) product-counts + useProductNerveCenter
│   ├── afiliar/  (S4)  afiliar.tsx + afiliar.data.ts
│   ├── educar/   (S5)  educar.builder.ts + educar.data.ts + EducarOverlayPanel.tsx
│   ├── conversar/(S6)  conversar.jsx + conversar.data.ts
│   └── consultar/(S7)  KloelGraph.wallet-data.ts + wallet builder body
└── __tests__/
    └── KloelGraph.byte-identity.spec.ts  # the gate
```

### A.2 Carve ORDER inside S0 (gate after each step)

1. **seeds + builders + domain-constants** (data; byte-neutral by builder OUTPUT).
2. **engine pure** (no JSX → prove byte-identity of the GRAPH, not pixels).
3. **Canvas / chrome** (visual).
4. **`NodePanel` router shell** with an EMPTY `SCREEN_BY_TYPE` map (screens still
   inline at this point; map filled per-galaxy in S1–S7, wired in S8).
5. **`KloelInner` → `state/useKloelGraphState.ts`** LAST (largest blast radius).

> The literal carries `@ts-nocheck` + `eslint-disable`. Carved modules drop those
> and pass full gates. The verbatim literal keeps them.

---

## B. Byte-identity rule (visual-identical) — the gate contract

`__tests__/KloelGraph.byte-identity.spec.ts`:

1. Serialize the graph per node:
   `{ id, parentId, type, label, subtitle, area, pos:{x,y} }`
   ordered stably by `(area, parentId, id)`.
2. Run `buildGraph@924 → computeLayout@1118 → computeGalaxyAnchors@1188` with a
   **FIXED SEED**: zero/normalize `Math.random` in `defaultPlan@123` (plan id) and
   fix `alpha`/`t` in `physicsTick@1223`.
3. Diff byte-for-byte: (a) literal `harness.html` output vs (b) carved/decomposed
   output. MUST be identical.
4. Chrome devtools render diff (S0 + S8): mount both, screenshot, pixel-compare the
   canvas + overlay chrome.

Gate runs after every S0 carve step AND after every galaxy's body swap.

---

## C. Node → real data (per domain). honest-empty = zero entity nodes, never seed.

| Domain | Builder (literal) | Seed to retire | Real data source | honest-empty rule |
|---|---|---|---|---|
| Perfil | `buildProfileNodesEdges@570` (already `if`-gated) | accountData arg (no `DEFAULT_ACCOUNT_DATA` exists) | ContaView self-fetches; node is a static route node (no seed) | static perfil/dashboard nodes always render; entity children only with real data |
| Dashboard | (static route node) | none | `useDashboardHome` `/dashboard/home`, `useDashboardPostPayment` `/dashboard/post-payment`, `/dashboard/stats` | HomeView must NOT fall back to seed |
| Kloel | `buildKloelNodesEdges@898` | `kloel.conversations[]`, `kloel.images[]` (KLOEL_ACTIONS stays static) | `searchKloelThreads`/`loadKloelThreadMessages` (history), `uploadChatFile` (images) | loading/empty/error → conversations:[]/images:[] → only 4 action nodes |
| Criar | `buildProductSubnodes@300` → live `buildKloelGraphProductNodes` | `PRODUCTS@222`, `defaultProductEditor@138` | `useProducts` `/products` + `loadCheckoutGraphProducts` `/checkout/products` | `buildKloelGraphProductNodes([])→[]` already honest |
| Afiliar | `buildAffiliateNodesEdges@368` (pure) | `MARKETPLACE_SEED@357`, `MY_AFFILIATES_SEED@344`, `PARTNER_CHATS_SEED@349` (keep `AFFILIATE_BRANCHES@337`) | `affiliateApi` marketplace, `useAffiliates`/`useAffiliateDetail`/`usePartnerChatContacts` | loading/empty/error → [] (4 branch nodes remain) |
| Educar | `buildEducarNodesEdges@421` | `MEMBER_AREAS_SEED@390` | `useMemberAreas` `/member-areas` (subtitle from list-item counts, NOT `useMemberAreaStats` which is aggregate) | loading/empty/error → only `eu-ensinar` parent |
| Conversar | `buildConversarNodesEdges@604` (takes data obj) | `CRM_SEED`/`CONTACTS_SEED`/`CONVERSATIONS_SEED`/`ORDERS_SEED`/`AD_CAMPAIGNS_SEED` (+panel-only `AUTOPILOT_EVENTS_SEED`/`FOLLOWUPS_SEED`/`AD_RULES_SEED`) | `useCRM`/`useSalesPipeline`/`useSales`/`useAnuncios`/`useConversationHistory` | loading/empty/error → [] per slice → `cv-crm` + active `CRM_MODULES` only |
| Consultar | `buildWalletNodesEdges@653` (`if(!wallet)return` guard) | `DEFAULT_WALLET@638`, `ORDERS_SEED@465` | `useWalletBalance`/`useWalletWithdrawals`/`useWalletAnticipations`; analytics via `lib/api/analytics.ts` | loading/empty/error → 8 `walletBranch` only, zero `walletItem` |

> **Vendas overlap**: `ORDERS_SEED` feeds BOTH `wl-vendas` (Consultar) and
> `cv-vendas` (Conversar). On de-seed, BOTH must consume the SAME real source
> (one analytics/orders endpoint) — no divergent reality.

---

## D. Overlay → real component (per `node.type`). `SCREEN_BY_TYPE` map.

`overlays/KloelGraphNodePanel.tsx` resolves a screen by `node.type` (literal
`NodePanel@4441` router + `KloelOverlayRouter@6077`). S0 ships the router with an
empty `SCREEN_BY_TYPE`; each galaxy registers its entries; S8 wires the map.

| `node.type` | Literal inline (replace body) | Real component | Props contract |
|---|---|---|---|
| `profileSection`/`appNode` | inside `NodePanel`/`AppNodePanel@3886`/`CoreSettingsPanel@5258` | `ContaView` | self-fetch; no props (or route `/settings`) |
| (dashboard) | n/a (static) | `HomeView` + `DashboardPostPaymentPanel` | self-fetch |
| `kloelAction(newChat)` | `KloelChatScreen@5817` | **keep literal screen; swap ONLY `send()`** (delete `api.anthropic` block @5841-5846 → `streamAuthenticatedKloelMessage(messages,{conversationId},onEvent,{signal})` from `lib/kloel-conversations.ts:147`, POST `/kloel/think` SSE) | keep transcript/greeting/composer/catch@5850 |
| `kloelAction(search)` | `KloelSearchScreen@5928` | keep panel; feed real index (optionally `useCommandPalette`) | preserve visuals |
| `kloelAction(images)` | `KloelImagesScreen@5988` | keep verbatim; data via `uploadChatFile` + honest-empty | local preview until LIST endpoint confirmed |
| `kloelAction(recents)`/`kloelConversation` | `KloelRecentsScreen@6038`/`KloelMassPanel@6085` | keep verbatim; data via `searchKloelThreads` | honest-empty |
| product/`p_*` | (router by tab) | `ProductNerveCenter` (`/products/:id?tab=<id>`, props `{productId, initialTab, initialPlanSub, initialComSub, initialModal, initialFocus, onBack}`) | route-nav (A) or import-mount (B) |
| `affBranch`/`affProduct`/`affPartner` | inline | `ProdutosView`/`AfiliarSe`, `AffiliateProductDetail({item,onBack,...})`, `AffiliateDetailSheet({affiliate,onClose,onChat,onRevoke})` | `affId`→`useAffiliateDetail` |
| `memberArea` | `MemberAreaPanel` (literal `Desktop:3073`) | `EducarOverlayPanel` wrapper → `ProdutosAreaMembrosTab({totalStudents,displayAreas,avgCompletion,mutateAreas,productOptions})` | wrapper derives props from `useMemberAreas`+`useMemberAreaStats` |
| `crm`/`contact` | `CrmPanel@3005`/`ContactPanel@3302` | `CRMPipelineView` (no props), `ContactDetailDrawer({phone,onClose})` (`contactId`→`phone`) | |
| `order`/(vendas) | `OrderPanel@3121`/`VendasPanel@3073` | `VendasView({defaultTab?})` | |
| `adCampaign` | `AnunciosPanel@3154`/`AdCampaignPanel@3209` | `AnunciosView({defaultTab?})` | setup-required if `/api/anuncios/*` empty |
| `conversation` | `ConversationPanel@3355` | `InboxWorkspace(props)` or `ConversationsView` (no props) | |
| (autopilot) | `AutopilotPanel@3242` | `AutopilotDecisionLog(props)` | verify prop shape |
| `walletBranch`/`walletItem` | (route) | `KloelCarteira({defaultTab})` + `Carteira*`; analytics `KloelRelatorio` tabs | route-nav; needs Toaster/useToast above overlay |

> **Brand glyph**: literal `KloelMushroom@5585` → `KloelMushroomVisual`/`Mark`
> from `KloelBrand.tsx` ONLY if pixel-identical; else leave in-file.

---

## E. Overlay mechanics + deep-linking (S8)

- **Decision-dependent**:
  - **(B) state-based (Opção C):** `KloelOverlayRouter@6074` is the single mount
    point; screens selected by `selectedNode.type` (no router push). Swap inline
    bodies for real components via `SCREEN_BY_TYPE`. Provider check: literal screens
    read a file-local `ThemeProvider/useTheme@43-53`; real components consume
    `@/lib/design-tokens` — they compose without conflict. SSE/auth via global
    `tokenStorage`/`API_BASE` under `(main)` auth.
  - **(A) route-based (live):** keep `openNode→router.push(node.route)`; overlay
    renders the route page as `{children}`. Most galaxies already wired.
- **Deep-linking**: preserve `data-testid=kloel-graph-shell`, the `/→/products?graph=1`
  rewrite, and `closeOverlay` re-adding `?graph=1` (PR#473). In B, mirror these as
  URL sync so a deep link selects the right `selectedNode`.
- **No new routes** in B (import-direct). In A, routes already exist.

---

## F. Visual-identical enforcement (every slice)

1. Same React tree, same props order, same `patch*` callbacks when swapping a body.
2. No restyle of overlay chrome or inner screens.
3. Byte-identity gate (section B) GREEN after the swap.
4. Chrome devtools pixel diff GREEN for the domain's nodes + its overlay.

# SLICE S7 — Galaxy Consultar (Carteira + Analytics) (PARALLEL after S0)

## Escopo
Map verdict: overlay swap **already done** (real route screen renders as overlay
children). Residual: de-seed the wallet builder (`DEFAULT_WALLET`/`ORDERS_SEED`) →
real data with honest-empty when entity nodes (saques/antecipações/items) must show.

## Arquivos (writes — DISJOINT)
- `domains/consultar/KloelGraph.wallet-data.ts` (adapter `useWalletBalance`/
  `useWalletWithdrawals`/`useWalletAnticipations` → `wallet` shape for
  `buildWalletNodesEdges@653`; loading/empty/error → withdrawals:[]/anticipations:[],
  8 branches only; NEVER `DEFAULT_WALLET`)
- `domains/consultar/wallet-builder.ts` (body of `buildWalletNodesEdges@653`; keep
  `if(!wallet)return` guard@655; preserve `WALLET_BRANCHES@628` + output shape)
- `domains/consultar/screens.ts` (SCREEN_BY_TYPE: walletBranch/walletItem→KloelCarteira;
  report tabs→KloelRelatorio)

## Reads-only
`carteira.tsx`+`Carteira*`, `analytics/page.tsx`+`tabs/*`, `useWallet.ts`,
`lib/api/wallet.ts`, `lib/api/analytics.ts`, `KloelGraph.routes.ts`.

## Node → data
`buildWalletNodesEdges@653`: source `DEFAULT_WALLET@638` → adapter. honest-empty:
8 `walletBranch` always; `walletItem` only with real data. Vendas/Assinaturas/
Abandonos/Estornos emit NO entity nodes today (no seed) — keep; depth lives in the
real Analytics tabs when opened.

## Vendas overlap (HARD)
`ORDERS_SEED@465` feeds BOTH `wl-vendas` (here) and `cv-vendas` (S6). De-seed BOTH
to ONE real source (analytics/orders endpoint) — no divergent reality. Coordinate
the shared source with S6.

## Overlay → component
walletBranch/walletItem→`KloelCarteira({defaultTab})` + `Carteira*`; analytics→
`KloelRelatorio` tabs. Route-nav (A) already wired. Confirm `(main)` layout provides
`Toaster`/`useToast` above the overlay (carteira withdraw/anticipate modals).

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on `domains/consultar/*`.
2. Confirm WHERE `buildWalletNodesEdges` is invoked for the live graph (static-nodes
   vs builder) → decides if adapter feeds shell or literal.
3. Build adapter; de-seed wallet + orders (shared source w/ S6); honest-empty.
4. Byte-identity gate + tsc/eslint/vitest; smoke loading/empty/error.
5. release + small commit.

## Stop conditions
`Toaster`/`useToast` not above overlay · Vendas source not agreed with S6 ·
DECISÃO unresolved.

---
@import _PLAYBOOK.md

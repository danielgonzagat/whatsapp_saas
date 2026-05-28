# Wave 60 — `guest-chat.action-intent.helpers.ts` Decomposition Plan

> **Status**: PLAN ONLY (deferred — file is concurrent-agent WT).
> **Author**: Wave 60 subagent A.
> **Date**: 2026-05-28.
> **Branch**: `codex/backlog-consolidation-production-v2`.
> **Target file**: `backend/src/kloel/guest-chat.action-intent.helpers.ts` (1114 LOC,
>   ~40.7 KB).
> **Concurrent territory**: Yes — `git status --short` shows `M` on the file at
>   plan time. Per Wave 59 protocol (see `WAVE_59_STATUS.md` §3 "Working-tree
>   caveat"), no edits attempted; this plan captures the decomposition strategy
>   so the next subagent (after the concurrent agent's WT commit lands) can
>   execute mechanically.

---

## 1. Why decompose

- Largest non-spec backend file (1114 LOC) — biggest remaining single-file
  cognitive-load hotspot in `backend/src/kloel/`.
- `detectActionIntent` is one mega-`if` chain spanning lines 1-589 (40+ domain
  branches). Adding a new intent today requires scrolling through every other
  domain. Order matters (priority comments encode it), but groups are
  independent.
- Five `extract*Args` helpers (`Product`, `Plan`, `Payment`, `Coupon`, `Url`,
  `Affiliate`, `Fiscal`) plus `extractProductName` live in the same file —
  ~500 LOC of arg-extraction is orthogonal to intent dispatch.
- Single existing spec file (`guest-chat.action-intent.helpers.spec.ts`,
  11 KB) already exists and exercises the public API; decomposition must
  preserve **all named exports** so the spec stays green without edits.

---

## 2. Public API (must be preserved verbatim)

The file currently exports:

| Export | Kind | Lines | Consumers (rough) |
|---|---|---|---|
| `detectActionIntent` | function | 1-589 | `kloel-tool-dispatcher.service.ts`, intent-router |
| `extractProductName` | function | 591-635 | re-used inside this file + by intent-router |
| `extractProductArgs` | function | 636-749 | dispatcher product handlers |
| `extractPlanArgs` | function | 750-941 | dispatcher plan handlers |
| `extractPaymentArgs` | function | 942-970 | dispatcher payment handlers |
| `extractCouponArgs` | function | 971-1007 | dispatcher coupon handlers |
| `extractUrlArgs` | function | 1008-1032 | dispatcher URL handlers |
| `extractAffiliateArgs` | function | 1033-1078 | dispatcher affiliate handlers |
| `extractFiscalArgs` | function | 1079-1113 | dispatcher fiscal handlers |
| re-export `appendToolResultProof`, `formatToolResult` from `./guest-chat.format-tool-result.helpers` | re-export | 1114 | various |

Every consumer imports from `'./guest-chat.action-intent.helpers'` (or the
`backend/src/kloel/guest-chat.action-intent.helpers` path). The post-decomp
top-level file must continue to export **the same identifiers** so no
downstream import has to change.

---

## 3. Proposed companion files

Strategy: extract the **arg-extractors first** (lowest blast radius, no
ordering concerns), then extract the **intent groups** by domain. Each split
goes into a sibling file in the same dir following the existing convention
(`guest-chat.<topic>.helpers.ts`).

### 3a. Arg-extractor splits (Phase 1 — easiest, ~510 LOC out)

| New file | Moves | Approx LOC | Notes |
|---|---|---|---|
| `guest-chat.action-intent.product-args.helpers.ts` | `extractProductName`, `extractProductArgs` | ~160 | already a similarly named file `guest-chat.product-args.helpers.ts` exists with different content — **use the longer name** to avoid collision; OR consolidate into the existing file (decide post-merge) |
| `guest-chat.action-intent.plan-args.helpers.ts` | `extractPlanArgs` | ~190 | Pure function on `msg` string — trivial extract |
| `guest-chat.action-intent.payment-args.helpers.ts` | `extractPaymentArgs` | ~30 | Trivial |
| `guest-chat.action-intent.coupon-args.helpers.ts` | `extractCouponArgs` | ~40 | Trivial |
| `guest-chat.action-intent.url-args.helpers.ts` | `extractUrlArgs` | ~25 | Trivial |
| `guest-chat.action-intent.affiliate-args.helpers.ts` | `extractAffiliateArgs` | ~45 | Trivial |
| `guest-chat.action-intent.fiscal-args.helpers.ts` | `extractFiscalArgs` | ~35 | Trivial |

After Phase 1 the top-level file shrinks to ~600 LOC (just
`detectActionIntent` + the re-exports). Each new file re-exports its symbol(s)
back from the index file so consumers don't change.

### 3b. Intent dispatch splits (Phase 2 — ~590 LOC out)

Group the 40+ domain branches by cohesion. Each group becomes a small module
returning `{ tool: string; args: Record<string, unknown> } | null`; the main
`detectActionIntent` becomes a sequenced `||` chain.

| New file | Section markers absorbed | Approx LOC |
|---|---|---|
| `guest-chat.action-intent.self-awareness.match.ts` | SELF-AWARENESS / P1 | ~30 |
| `guest-chat.action-intent.products.match.ts` | PRODUTOS, DELETAR PLANO/CHECKOUT, URL CRUD, DETALHES DO PRODUTO, PLANOS, EDITAR PLANO/CHECKOUT | ~120 |
| `guest-chat.action-intent.broadcast-checkout.match.ts` | BROADCAST/CAMPANHA, CHECKOUTS, CUPONS, CRIAR VENDA/PEDIDO MANUAL, ORDER BUMP, EDITAR CUPOM | ~80 |
| `guest-chat.action-intent.payments-wallet.match.ts` | PAGAMENTOS, CARTEIRA, ESTORNOS, ANTECIPAÇÕES | ~50 |
| `guest-chat.action-intent.crm-sales.match.ts` | NPS/CHURN, URLs/PÁGINAS, VENDAS, CRM/LEADS, CRM/PIPELINE, VENDAS FÍSICAS/ENVIO/RASTREIO | ~80 |
| `guest-chat.action-intent.config.match.ts` | CONVERSAS/MEMÓRIA, PLAN PHOTO UPLOAD, APARÊNCIA, CONFIGURAÇÕES, UPLOAD/IMAGEM, PIXEL, E-MAIL/MARKETING | ~75 |
| `guest-chat.action-intent.affiliates.match.ts` | ASSINATURAS/ASSINANTES, AFILIADOS: MERCHAN/TERMOS/COPRODUÇÃO, EDITAR CONFIG AFILIADOS, AFILIADOS, LISTAR AFILIADOS, MARKETPLACE/AFILIAR-SE | ~70 |
| `guest-chat.action-intent.commerce-extras.match.ts` | REDES SOCIAIS, GARANTIA/EXIT INTENT/AFTER PAY, AVALIAÇÕES, SOCIAL PROOF, MULTI-CANAL, WHATSAPP, FRETE/ENTREGA, ASSINATURAS, PRODUTOS FÍSICOS, DADOS FISCAIS/DOCUMENTOS | ~110 |
| `guest-chat.action-intent.meta-code.match.ts` | CÓDIGO (Meta 1), CODEGRAPH (Meta 1) | ~90 |

### 3c. Final shape of `guest-chat.action-intent.helpers.ts` (~80 LOC)

```ts
import { detectSelfAwarenessIntent } from './guest-chat.action-intent.self-awareness.match';
import { detectProductsIntent } from './guest-chat.action-intent.products.match';
// … etc

export function detectActionIntent(message: string) {
  const msg = message.toLowerCase().trim();
  return (
    detectSelfAwarenessIntent(msg, message) ||
    detectProductsIntent(msg, message) ||
    detectBroadcastCheckoutIntent(msg, message) ||
    detectPaymentsWalletIntent(msg, message) ||
    detectCrmSalesIntent(msg, message) ||
    detectConfigIntent(msg, message) ||
    detectAffiliatesIntent(msg, message) ||
    detectCommerceExtrasIntent(msg, message) ||
    detectMetaCodeIntent(msg, message) ||
    null
  );
}

export { extractProductName } from './guest-chat.action-intent.product-args.helpers';
export { extractProductArgs } from './guest-chat.action-intent.product-args.helpers';
export { extractPlanArgs } from './guest-chat.action-intent.plan-args.helpers';
export { extractPaymentArgs } from './guest-chat.action-intent.payment-args.helpers';
export { extractCouponArgs } from './guest-chat.action-intent.coupon-args.helpers';
export { extractUrlArgs } from './guest-chat.action-intent.url-args.helpers';
export { extractAffiliateArgs } from './guest-chat.action-intent.affiliate-args.helpers';
export { extractFiscalArgs } from './guest-chat.action-intent.fiscal-args.helpers';
export { appendToolResultProof, formatToolResult } from './guest-chat.format-tool-result.helpers';
```

Expected: **1114 → ~80 LOC** (delta ~-1030 in the index file; total LOC across
the package grows slightly due to per-file boilerplate, ~+150).

---

## 4. Order-preservation invariant (CRITICAL)

`detectActionIntent` returns the **first** matching branch. Several comment
markers in the file explicitly note ordering dependencies:

- `// ── CARTEIRA ── (saque antes de saldo, extrato antes de saldo/carteira)`
- `// ── NPS / CHURN (antes de vendas para nao capturar) ──`
- `// ── URLs / PÁGINAS ── (antes de vendas para capturar "pagina de vendas")`
- `// ── VENDAS ── (metricas/analytics antes de vendas)`
- `// ── MULTI-CANAL ── (antes de redes sociais)`

When splitting groups, the **outer call sequence** in the new
`detectActionIntent` must preserve the original top-to-bottom evaluation
order, AND any **inter-group ordering constraints noted above** must be
documented and respected.

Concrete: `detectCrmSalesIntent` (which contains NPS/CHURN + URLs/PÁGINAS +
VENDAS) internally must keep NPS/CHURN regexes before VENDAS regexes — i.e.
do not alphabetize within a group either.

Recommend: add a one-line comment at the top of each `*.match.ts` file
referencing this plan so future maintainers don't accidentally re-order.

---

## 5. Validation gates (before commit)

1. `cd backend && npx tsc -p tsconfig.build.json --noEmit` → must be zero
   errors (Wave 59 baseline: 0).
2. `cd backend && npm run lint -- src/kloel/guest-chat.action-intent*` → no
   new warnings.
3. `cd backend && npx jest guest-chat.action-intent.helpers.spec` → all
   existing assertions green. The spec exercises the public API only, so it
   should pass without modification.
4. `cd backend && npx jest kloel-tool-dispatcher` → downstream consumer spec
   stays green (action-intent feeds the dispatcher).
5. `npm run canonical:check` from repo root → no canonical-vocabulary
   regressions.
6. `node scripts/ops/check-canonical-vocabulary.mjs` → 0 hard violations.

If any gate regresses, abort the decomposition and triage before commit.

---

## 6. Commit shape

Recommended split (avoids one mega-commit):

1. `refactor(kloel): extract guest-chat action-intent arg helpers (-510 LOC)`
   — Phase 1 only (the seven `extract*Args` files).
2. `refactor(kloel): split guest-chat action-intent dispatch by domain (-590 LOC)`
   — Phase 2 (the nine `*.match.ts` files).

Each commit is reversible and small enough to bisect.

No `--no-verify`. No `git restore`. No push (per Wave 60 constraint).

---

## 7. Pre-conditions for execution

Before next subagent runs this plan:

1. `git status --short backend/src/kloel/guest-chat.action-intent.helpers.ts`
   returns **empty** (concurrent agent's WT has landed in HEAD).
2. `git status --short backend/src/kloel/guest-chat.action-intent.helpers.spec.ts`
   returns **empty** (the spec is part of the same WT package).
3. Re-read this plan — section markers in the live file may have shifted
   slightly during the concurrent agent's session. Re-run
   `grep -nE "^(export |  // ── )"` on the file and reconcile against the
   table in §3b before splitting.
4. Confirm no `WAVE_60_*` doc has already been written that supersedes this
   plan.

---

## 8. Carry-forward into Wave 61+

After execution:

- Update `docs/architecture/WAVE_59_STATUS.md` § "Oversized-file inventory" to
  remove this file or downgrade it.
- File a follow-up to verify `kloel-tool-dispatcher.service.ts` (next-largest
  hotspot in the same module) for a similar split opportunity.
- The per-domain `*.match.ts` modules become natural targets for **unit
  test specs** — each can grow its own narrow spec instead of all assertions
  piling into `guest-chat.action-intent.helpers.spec.ts`. This is a follow-up
  improvement, not a precondition.

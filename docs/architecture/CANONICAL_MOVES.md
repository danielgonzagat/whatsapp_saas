# Canonical Moves — PR #462

This file is the **human-authored manifesto** of deliberate spec/governance
deletions performed by the canonicalization mission landed via PR #462
(`chore/canonicalization-helpers-mega-pr-2026-05-28`). Each line declares one
legacy path that was removed because its responsibility was migrated to a
canonical replacement, retired, or consolidated. The
`scripts/ops/check-ai-constitution.mjs` gate consults this file as one of
the "prova humana explicita" sources, so a delete listed here is allowed.

## Format

Each entry is one Markdown table row:

| Legacy path | Disposition | Canonical replacement | ADR / commit |
|---|---|---|---|

`Disposition` is one of: `moved`, `consolidated`, `retired`.

## Entries

| Legacy path | Disposition | Canonical replacement | ADR / commit |
|---|---|---|---|
| `backend/src/checkout/mercado-pago-webhook.controller.spec.ts` | consolidated | `backend/src/checkout/mercado-pago-webhook-signature.util.spec.ts` | Wave 21 — controller logic folded into signature-util scope. |
| `backend/src/email/email-inbound.controller.spec.ts` | consolidated | `backend/src/email/email-inbound.service.spec.ts` | Wave 21 — controller→service consolidation; controller is a thin adapter and its tests merged into the service spec. |
| `backend/src/kloel/hypproof/experiment-runner.service.spec.ts` | retired | _none_ | Wave 35 — hypproof feature decommissioned per backlog decision; the spec was removed alongside the service. |
| `backend/src/kloel/hypproof/proof-evaluator.service.spec.ts` | retired | _none_ | Wave 35 — same as above. |
| `backend/src/kloel/kloel-tool-dispatcher.service.chat-tools.spec.ts` | consolidated | `backend/src/kloel/kloel-tool-dispatcher.workspace-actions.handlers.spec.ts` + sibling handler specs | Wave 111 — dispatcher split into per-domain handler files; per-domain handler specs replace the monolithic chat-tools spec. |
| `backend/src/kloel/kloel-tool-dispatcher.service.dotted-alias.spec.ts` | consolidated | `backend/src/kloel/kloel-tool-dispatcher.product-catalog.handlers.spec.ts` + sibling handler specs | Wave 111 — same as above; dotted-alias dispatch covered by the product-catalog handler spec. |
| `backend/src/kloel/unified-agent-actions-sales.helpers.spec.ts` | moved | `backend/src/kloel/unified-agent-actions-sales.service.helpers.spec.ts` | Wave 108 PI-w108 (commit `bdefe868e`) — helpers file renamed to follow the `*.service.helpers.ts` canonical convention. |
| `backend/src/kloel/healthymoney/revenue-quality.scorer.service.spec.ts` | consolidated | `backend/src/kloel/healthy-money/revenue-quality.scorer.ts` (covered by `backend/src/kloel/healthy-money/healthy-money.spec.ts`) | Wave brain/mind cleanup — duplicate `healthymoney/` dir folded into canonical `healthy-money/`; the `.service` scorer no longer exists and its coverage lives in the canonical healthy-money spec. Owner-authorized push 2026-05-29. |
| `backend/src/marketing/channels/whatsapp/providers/waha.provider.spec.ts` | retired | _none_ | OmniCore dissolution — the WAHA provider was removed (WhatsApp unified under Meta Cloud API + the canonical ChannelDispatch port); no `WahaProvider` class remains in the tree. Owner-authorized push 2026-05-29. |
| `backend/src/whatsapp/providers/waha.provider.spec.ts` | retired | _none_ | OmniCore dissolution (pre-move path) — the original `backend/src/whatsapp/` tree was dissolved into `marketing/channels/`, then the WAHA provider was fully removed; no `WahaProvider` class remains. Both deleted, no surviving rename target. Owner-authorized push 2026-05-29. |

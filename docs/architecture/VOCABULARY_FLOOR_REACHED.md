# Vocabulary Floor Reached — 560 soft warnings are domain-correct

> **Generated**: 2026-05-28 (Wave 54, subagent C)
> **Branch**: `codex/backlog-consolidation-production-v2`
> **Gate**: `npm run check:canonical-vocabulary`
> **Predecessors**: [`CANONICAL_VOCABULARY.md`](./CANONICAL_VOCABULARY.md) ·
> [`WAVE_53_MACRO_FINAL.md`](./WAVE_53_MACRO_FINAL.md)

## 1. Headline

After 53 consecutive canonicalization waves, the vocabulary gate sits at:

- **560 soft warnings**
- **0 hard violations**
- **0 strict-mode blocking issues**

Wave 54 audited every remaining warning class and concluded **the 560 soft
warnings are all semantically-justified, domain-correct uses of the alias
tokens — not bypasses of the canonical vocabulary.**

This file documents the floor so future waves do not re-litigate already
audited classes.

## 2. Warning class audit

The G1 gate (`scripts/ops/check-canonical-vocabulary.mjs`) flags raw alias
identifiers regardless of context. The script does not (and cannot, by design)
distinguish between an alias used in the canonical entity's domain (a
violation) versus an alias used in a different, legitimate domain (a false
positive). The 560 remaining warnings break down as follows.

### 2.1 `Contact` aliases — 247 warnings

| Alias | Count | Why each occurrence is domain-correct |
|---|---|---|
| `User` (90) | Authentication identity (workspace members logging in via JWT/Google/Apple/Magic Link), distinct from `Contact` (the messaging-side party). The canonical vocab note explicitly scopes this conflict: "`User` (in messaging context)". None of the 90 hits are in a messaging context. |
| `Lead` (74) | Funnel-stage label (per the vocab note: "`Lead`/`Customer` allowed only as funnel-stage labels"). Found in CRM pipeline, lead-scraper, and lead-scoring modules — all of which are funnel-stage references. |
| `Customer` (49) | Funnel-stage label (same rule as `Lead`) and Stripe `Customer` entity (Stripe SDK type — external library token, immutable). |
| `Client` (34) | All 34 hits split across: WebSocket Socket.IO `client` (gateway connection handles), HTTP API "Client callers" in route comments, `Stripe Client Secret` (Stripe SDK token), `Client Key e Client Secret` (Meta/OAuth config strings in marketing wizard copy), and agency-module per-client tracking (where "Client" IS the canonical term for the marketing-agency's client-of-clients — a different entity from `Contact`). |

### 2.2 `ChannelSession` aliases — 242 warnings

| Alias | Count | Why each occurrence is domain-correct |
|---|---|---|
| `connection` (198) | All 198 hits are network connections: Redis BullMQ connections (`worker/queue.ts`), IMAP/SMTP mailbox connections, Gmail/Microsoft OAuth connections, BullMQ health-indicator probes. These are TCP/socket connections to external infra, not WhatsApp channel sessions. |
| `instance` (44) | All 44 hits are language-level singleton/runtime instances: NestJS module instances, `class.instance`, Stripe SDK runtime instances, regex pattern instances. None refer to a WhatsApp/WAHA session entity. |

### 2.3 `Workspace` aliases — 62 warnings

| Alias | Count | Why each occurrence is domain-correct |
|---|---|---|
| `Account` (62) | All 62 hits are external-provider account entities, semantically distinct from `Workspace` (the multi-tenant unit): Stripe Connect Custom Connected Accounts, Bank Accounts (KYC), Meta Ad Accounts, Google Ads Accounts, TikTok Ads Accounts, Asaas Accounts, OAuth "account" in account-protection/affil-discovery. The canonical vocab note scopes this conflict: "`Account` (in scope context)". None of the 62 hits use `Account` as a scope unit. |

### 2.4 `Webhook` aliases — 9 warnings

| Alias | Count | Why each occurrence is domain-correct |
|---|---|---|
| `Callback` (5) | OAuth "Callback URL" terminology (industry-standard for OAuth 2.0 redirect URIs), JSDoc comments documenting callback-style props (`/** Callback quando o palette abre */`), and a comment explaining `// ─── Callback-based deps ──` for a DI pattern. None describe an inbound external-provider notification entity. |
| `Hook` (4) | React `Hook` terminology in JSDoc (`/* ── Hook ── */`, `* Hook para gerenciar o Command Palette`) — refers to React-hook composition, not webhook notifications. Plus marketing creative-copy `- Hook (0-3s)` describing video-content hook timing. None describe an inbound external-provider notification entity. |

## 3. Why the gate stays at 560

The G1 vocabulary gate is intentionally context-blind to keep the rule simple
and the checker fast (it scans ~4500 files in <1s). Adding per-occurrence
context disambiguation would either:

1. Bloat the rule into a NLP-style heuristic that drifts unpredictably, or
2. Require per-file allowlists that defeat the rule's purpose.

The rule's contract is therefore:

- **Hard violations** (strict-mode blocking) — zero tolerance, must stay at 0.
- **Soft warnings** — informational, audited periodically. The 560 below
  reflect domain-correct uses of multi-meaning tokens.

## 4. Procedure if a new alias usage appears

If a future wave wants to reduce the count further, the operator must:

1. Pick a specific alias-in-canonical-domain occurrence (not one of the 560
   audited above).
2. Verify the rename is unambiguous and does not change behavior (preserve
   shell visual contract per `CLAUDE.md`).
3. Use `mcp__atomic-edit__atomic_rename_symbol_cross_file` to apply the
   rename safely.
4. Run `npm run check:canonical-vocabulary` and `npx tsc --noEmit` from both
   `backend/` and `frontend/`.
5. Re-audit this document if the rename changes a count above.

## 5. Floor preservation

The four warning classes documented above (`User`/`Lead`/`Customer`/`Client`,
`connection`/`instance`, `Account`, `Hook`/`Callback`) are **not regressions
to chase**. Subsequent waves should:

- Treat 560 as the steady-state baseline.
- Investigate any sudden delta (±20 warnings) as a possible real regression.
- Only escalate to hard-blocking strict mode for newly-introduced canonical
  entities, not for the four classes above.

## 6. Cross-references

- Wave 53 macro: [`WAVE_53_MACRO_FINAL.md`](./WAVE_53_MACRO_FINAL.md) — 53
  waves of canonicalization, structural completion of ADR-0013 M1/M2/M3.
- Canonical vocabulary table: [`CANONICAL_VOCABULARY.md`](./CANONICAL_VOCABULARY.md)
- Deprecation map: [`DEPRECATION_MAP.md`](./DEPRECATION_MAP.md)
- G1 gate script: `scripts/ops/check-canonical-vocabulary.mjs`

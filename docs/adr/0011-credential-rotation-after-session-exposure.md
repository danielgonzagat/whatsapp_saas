# ADR-0011 — Credential Rotation After 2026-05-20/21 Session Exposure

**Status:** Proposed
**Date:** 2026-05-21
**Drivers:** REGRA DE SEGREDOS (CLAUDE.md), ADR-0010 (initial risk acceptance)

## Context

ADR-0010 (2026-05-20) accepted the risk of exposing 6 specific credentials
through the Claude chat surface to unblock the MercadoPago PIX deployment:

- 4 MercadoPago credentials (Public Key, Access Token, Client ID, Client Secret)
- 2 Railway credentials (Project Key, Account Token)

During the subsequent autonomous session (2026-05-21), the agent invoked
`mcp__railway__list_service_variables` to verify that `SENTRY_DSN` was
properly wired. The tool's response included the **entire** env table — 80+
variables — in plaintext, persisting them in the conversation log.

This is a significant expansion of the credential exposure surface beyond
what ADR-0010 accepted.

## Affected credentials

See companion GitHub issue #414 for the full inventory. Summary:

- **Tier S (5)**: `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ADMIN_MFA_ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`
- **Tier A (~14)**: provider API keys (Anthropic, OpenAI, DeepSeek, Stripe, Meta, Google, TikTok, Apple, R2, Sentry)
- **Tier B (~8)**: rotation-on-convenience (Resend, Internal, WAHA leftover, 5 token-encryption keys)

## Decision

Rotate **all** credentials enumerated in issue #414 according to the tier
SLAs (S: 24h, A: 1 week, B: at convenience).

For each rotation:

1. Owner generates/retrieves the new value at the provider's dashboard
2. Agent sets it via `mcp__railway__variable_set` — value transits
   server-side through the Railway MCP; it does **not** re-enter the chat
   surface unless echoed in tool output
3. Owner runs the agent's smoke test (boot logs, endpoint reachability)
4. Owner revokes the old credential at the provider

## Operating boundary going forward

To prevent future expansion of this surface:

- **NEVER** call `list_service_variables` again unless the user explicitly
  authorizes a specific re-audit. The earlier call set the precedent that
  this is a high-impact read.
- When env verification is needed for *specific* vars, use direct
  smoke tests (curl, log inspection) instead of variable listing.
- When env values must be **set** (not read), use `variable_set` /
  `variable_bulk_set` — they accept values without echoing them back.
- Tool calls that echo credentials (`variable_set` response includes the
  set value in plaintext) should be batched so the conversation surface
  contains the operation, not the table.

## Why this is "Proposed" not "Accepted"

This ADR is **proposed** by the agent. It becomes **accepted** only when
the owner confirms the rotation plan + SLAs. Until then, the exposure is
documented but the remediation has not been validated.

## Related

- [ADR-0010](0010-credential-risk-acceptance-2026-05-20.md) — initial risk acceptance
- GitHub issue #414 — rotation tracking
- CLAUDE.md "REGRA DE SEGREDOS" — the policy violated

# Email Routing Canonical Policy

**Design item: EMAIL routing decision (bucket C) — RESOLVED**

Date: 2026-06-07
Status: DECISION (canonical policy) + thin flag-gated facade (default OFF)

## Problem

Email is the one channel with **two genuinely different outbound mechanisms**,
each already implemented as its own canonical
[`ChannelDispatchPort`](../../backend/src/common/channel-dispatch/channel-dispatch.port.ts)
adapter behind the
[`ChannelDispatchRegistry`](../../backend/src/common/channel-dispatch/channel-dispatch.registry.ts):

| Mechanism | ChannelKind | Adapter | Underlying send | Sender identity |
| --- | --- | --- | --- | --- |
| **Connected mailbox** | `email` | [`EmailDispatchAdapter`](../../backend/src/marketing/channels/email/email-dispatch.adapter.ts) | Gmail / Microsoft / IMAP-SMTP `sendMessageFromMailbox` | The workspace's **own connected address** |
| **Platform / campaign** | `email_transactional` | [`TransactionalEmailDispatchAdapter`](../../backend/src/marketing/channels/email/transactional-email-dispatch.adapter.ts) | `EmailService.sendEmail` → Resend / SendGrid / env-SMTP | The **platform sender** (`noreply@kloel.com`) |

Earlier waves flagged this as the blocker to "dissolving" email into a single
adapter: the connected-mailbox path and the campaign path differ in **provider**
AND **sender identity**, so collapsing them into one adapter would silently
change which address recipients see mail from. That is a behavior change, not a
refactor. See the explicit exclusion already documented in
[`channel-transport-canonical-delegate.flag.ts`](../../backend/src/kloel/channel-transport-canonical-delegate.flag.ts):
email is intentionally excluded from transport→canonical delegation for exactly
this reason.

## Decision

**Do NOT merge the two mechanisms. Keep both adapters and route by message
class.**

Email is not one channel with two implementations — it is **two delivery
contracts** that happen to share the SMTP wire format. The canonical resolution
is therefore not a merge but a **routing policy**: a caller declares the
*message class* (the business intent), and the platform routes to the adapter
that satisfies that contract.

### Routing policy (canonical)

| Message class | Use case | Routes to | Why |
| --- | --- | --- | --- |
| **`transactional`** | 1:1 reply, relationship / conversational mail, anything that should appear to come FROM the workspace | `ChannelKind.EMAIL` (connected mailbox) | Deliverability + trust depend on the mail coming from the workspace's real connected address; threading and reply-to must match the inbox the human reads. |
| **`campaign`** | Bulk sends, newsletters, system / lifecycle mail, anything that must preserve a STABLE provider + sender identity regardless of mailbox connection | `ChannelKind.EMAIL_TRANSACTIONAL` (platform sender) | Bulk/system mail must not be hostage to whether a workspace connected a personal mailbox, must not burn a personal mailbox's sending reputation, and must keep the exact provider (Resend/SendGrid) + `noreply@kloel.com` identity auth, checkout and onboarding already rely on. |

> Note on naming: the `campaign` class routes to the channel kind historically
> named `email_transactional`. The kind name reflects the *underlying sender*
> (`EmailService.sendEmail`, the same path auth/checkout transactional mail
> uses), while the message *class* `campaign` reflects the *caller intent*. Both
> names are kept — the kind is the dispatch discriminant, the class is the
> business selector.

## Coexistence under the dispatch port (no merge required)

The two mechanisms already coexist cleanly because they use **distinct
`ChannelKind` discriminants**:

- `ChannelKind.EMAIL` → `EmailSendInput` → `EmailDispatchAdapter`
- `ChannelKind.EMAIL_TRANSACTIONAL` → `EmailTransactionalSendInput` → `TransactionalEmailDispatchAdapter`

Both are registered in
[`MarketingChannelsModule`](../../backend/src/marketing/channels/marketing-channels.module.ts)
and resolved by the registry by discriminant — they never collide. **The
`ChannelDispatchRegistry.send()` front door is the canonical entry point.** A
caller that already knows which mechanism it wants simply builds the matching
`ChannelSendInput` and calls `registry.send(input)`. Nothing about that path
changes with this decision; it is the status quo, now documented as
intentional.

## Optional facade — `routeEmail` (flag-gated, default OFF)

For callers that think in terms of *message class* rather than *channel kind*, a
thin, pure facade selects the correct existing input:

- [`email-routing.ts`](../../backend/src/marketing/channels/email/email-routing.ts)
  — `routeEmail(messageClass, req)` returns the correct discriminated
  `ChannelSendInput` (which the caller hands to `registry.send()`), or an honest
  blocked `ChannelSendResult` when a required field is missing.
- [`email-routing-facade.flag.ts`](../../backend/src/marketing/channels/email/email-routing-facade.flag.ts)
  — `KLOEL_EMAIL_ROUTING_FACADE`, **default OFF**.

Properties:

- **Pure.** No DI, no provider knowledge, no I/O. It only picks a channel kind
  and builds an input — it never sends.
- **Inert by default.** With the flag OFF, `routeEmail` returns a blocked
  result instead of an input, so even a future opt-in caller starts safe. The
  flag-independent routing *table* (`resolveEmailChannelKind` /
  `EMAIL_CLASS_TO_CHANNEL_KIND`) is always inspectable.
- **Zero live behavior change.** There are NO existing callers; flag-OFF is
  byte-identical to today regardless of the flag. The facade is wiring for the
  future, not a change to the present.
- **Honest validation.** The `campaign` class requires `subject` + `html` (the
  platform adapter's contract), so a missing field surfaces a
  `subject_and_html_required` block rather than a silent empty send.

### How a caller would adopt it (when ready)

```ts
import { routeEmail } from '../marketing/channels/email';

const routed = routeEmail('campaign', {
  workspaceId,
  toEmail,
  subject,
  html,
});
if ('channelKind' in routed) {
  return registry.send(routed); // existing adapter, unchanged
}
return routed; // honest blocked result, propagate as-is
```

Enabling the facade is a deliberate per-environment opt-in
(`KLOEL_EMAIL_ROUTING_FACADE=true`) plus wiring a caller to it — neither happens
as part of this design item.

## What this does NOT change

- No live email send path is touched. Both adapters, both providers, both
  sender identities are byte-for-byte as before.
- No schema migration. No new Prisma model, column, or queue.
- No merge of the two adapters. The `email` ↔ `email_transactional` split is
  now an **intentional, documented** part of the canonical taxonomy, not an open
  question.

## Cross-references

- [CHANNEL_DISPATCH_CANONICAL.md](./CHANNEL_DISPATCH_CANONICAL.md) — full dispatch taxonomy
- [SEND_MESSAGE_CANONICAL.md](./SEND_MESSAGE_CANONICAL.md) — `sendMessage` canonicalization
- [ADR-0012](../adr/0012-kloel-omnicore-channel-unification.md) — OmniCore channel unification
- [`channel-transport-canonical-delegate.flag.ts`](../../backend/src/kloel/channel-transport-canonical-delegate.flag.ts) — why email is excluded from transport→canonical delegation

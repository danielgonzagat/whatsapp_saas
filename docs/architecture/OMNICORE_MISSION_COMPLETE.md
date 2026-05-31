# OmniCore Mission — COMPLETE

> **Status:** COMPLETE — 2026-05-27
> **Mission:** Dissolve `backend/src/whatsapp/` as a top-level domain and
> re-home every artifact under canonical owners
> ([ADR-0012](../adr/0012-kloel-omnicore-channel-unification.md) +
> [ADR-0013](../adr/0013-kloel-mind-unification.md)).
> **Outcome:** WhatsApp is no longer a domain — it is a marketing channel.
> Mind is no longer fragmented — it is one unified cognitive surface.

---

## TL;DR

`backend/src/whatsapp/` no longer exists. Every file that lived there now
lives at its canonical home:

- WhatsApp runtime artifacts → `backend/src/marketing/channels/whatsapp/`
- CIA cognitive artifacts → `backend/src/kloel/mind/cia/`
- Knowledge artifacts (ai-brain) → `backend/src/kloel/mind/knowledge/`
- Observability artifacts (brain audit) → `backend/src/kloel/mind/observability/`
- Instagram + Messenger (meta/) → `backend/src/marketing/channels/{instagram,messenger}/`

The shell — UX, routes, events consumers, contracts — is intact. The
*topology* under the shell is now coherent.

---

## Timeline

| Phase | When | What landed |
|---|---|---|
| Diagnostic | 2026-05-26 | ADR-0012 (OmniCore) + ADR-0013 (Kloel Mind) authored and accepted |
| Migration sprint start | 2026-05-26 | First file moves into `marketing/channels/whatsapp/` and `kloel/mind/cia/` |
| Bulk runtime moves | 2026-05-26 → 2026-05-27 | ~138 files migrated in atomic, append-only commits |
| Brain→Mind alias layer | 2026-05-27 | 8 brain shims + `MIND_EVENT_ALIASES` taxonomy + consumer-side dual-routing |
| Final stub purge | 2026-05-27 | Last orphan stubs dropped, `whatsapp/` folder deleted |
| Mission complete | 2026-05-27 | This document committed |

**Mission commits:** ~140+ (61 `refactor(omnicore): …`, 57 `refactor(mind): …`,
plus brain↔mind alias, gate, doc, and spec commits).

---

## The Dissolution — receipts

```
backend/src/whatsapp/             →  0 files (folder removed)
backend/src/marketing/channels/whatsapp/  →  138 files
```

192 distinct file paths were deleted from `backend/src/whatsapp/` across the
campaign (`git log --diff-filter=D` count). The replacement paths exist under
`backend/src/marketing/channels/whatsapp/{,providers,…}/` and were verified by
the canonical gates listed below.

What moved (verbatim from the commit timeline):

- `account-agent.*` suite → marketing/channels/whatsapp
- `agent-conversation-state` + `agent-events` → marketing/channels/whatsapp
- `whatsapp.service`, `whatsapp-session.service`, `whatsapp-watchdog.service`,
  `whatsapp-message-dispatcher.service`, `whatsapp-send-rate-guard.service`,
  `whatsapp-media.service`, `whatsapp-catchup-*` family → marketing/channels/whatsapp
- `inbound-processor.service` + helpers → marketing/channels/whatsapp
- `WahaProvider`, `WhatsAppApiProvider`, `waha-session-*` providers,
  `waha-transport`, `provider-registry-*` suite (op/messaging/session/contacts)
  → marketing/channels/whatsapp/providers
- All controllers in `whatsapp/` → marketing/channels/whatsapp
- `WhatsappModule` itself → marketing/channels/whatsapp (ADR-0012 W3 final)

---

## Companion migrations

### CIA → `kloel/mind/cia/` (ADR-0013)

Every `cia/*` and `whatsapp/cia-*` file collapsed into a single canonical home:

- `cia.controller`, `cia.service`, `cia-runtime.service`
- `cia-backlog-run`, `cia-bootstrap`, `cia-chat-filter`,
  `cia-inline-fallback`, `cia-remote-backlog`, `cia-autonomy-advisor`
- The `CiaModule` itself (ADR-0013 #28 COMPLETE)
- All accompanying specs + helpers

### `ai-brain/` → `kloel/mind/knowledge/`

`AgentAssistService`, `KnowledgeBaseService`, `MediaFactoryService`,
`HiddenDataExtractorService`, `VectorService` + specs and helpers.

### `brain/` → `kloel/mind/observability/`

`BrainSpineAuditService`, `MindObservabilityService`, `MindReportService`,
`MindLiftReportService`, `MindSpineAuditService` — every audit/report
surface for the cognitive layer landed under one roof.

### `meta/{instagram,messenger}` → `marketing/channels/{instagram,messenger}`

Instagram and Messenger followed the same OmniCore topology: a channel is
a channel, not a top-level domain.

---

## Brain → Mind alias layer

Eight `Brain*Service` shims now route consumers off the legacy `brain.*`
identifiers and into their canonical `Mind*Service` counterparts. The
shims are still importable (zero-downtime cutover), but every new emit
site uses the canonical name.

**Consumer batches migrated this session:**

1. `kloel/` internal consumers — batch 1 + batch 2
2. Guest-chat `BrainEventSpineService` → `MindEventSpine` (final consumer)
3. Three `whatsapp/` consumers cut to canonical `kloel/mind/cia` paths

---

## Event taxonomy — `mind.*` is canonical

Four canonical event names are now live on `BRAIN_EVENT_TAXONOMY` (the
single source of truth), with a dual-emit alias layer that accepts the
legacy names during cutover:

| Canonical (emit forward) | Legacy (still accepted) |
|---|---|
| `mind.message.received` | `message.received` |
| `mind.action.executed` | `capability.executed` |
| `mind.product.observed` | `product.created` |
| `mind.plan.observed` | `plan.created` |

Plus four other canonical-from-day-one mind events:

- `mind.decision.created`
- `mind.decision.resolved`
- `mind.prediction.created`
- `mind.prediction.resolved`
- `mind.surprise.recorded`

`MIND_EVENT_ALIASES` is one-way (legacy → canonical). The inverse direction
is intentionally not exported — it would be a regression vector.

---

## P0 duplicate resolutions

The duplication register flagged four P0 (production-blocking) duplicates
prior to the mission. All four are resolved:

1. WhatsApp provider duplication (`MetaWhatsAppService` vs
   `WhatsAppApiProvider`) — collapsed into the single provider registry
2. CIA service tree (`cia/` + `whatsapp/cia-*` + `kloel/cia-*` fragments)
   — unified under `kloel/mind/cia/`
3. Brain audit surface (`brain/` + scattered `Mind*Audit` services)
   — unified under `kloel/mind/observability/`
4. Channel transports — `WhatsAppChannelTransport` now resolves to the
   same provider registry that the marketing channel module owns

---

## Canonical gates active

The mission is guarded by six anti-regression gates wired into
`npm run canonical:check` and `scripts/ops/check-all-gates.mjs`:

| Gate | Script | Purpose |
|---|---|---|
| **waha** | `scripts/ops/check-no-direct-waha-import.mjs` | Block any direct WAHA import outside the provider registry |
| **brain** | `scripts/ops/check-no-direct-brain-imports.mjs` | Block re-import of the legacy `brain/` surface |
| **utils-drift** | `scripts/ops/check-cross-boundary-utils-drift.mjs` | Detect duplicate util re-creation across domain boundaries |
| **duplicates** | `scripts/ops/check-canonical-duplicates.mjs` | Byte-identical function/type duplicates vs CAPABILITY_MAP baseline |
| **events** | `scripts/ops/check-canonical-events.mjs` | Every `.emit('…')` must match EVENT_TAXONOMY or canonical-form regex |
| **services** | `scripts/ops/check-canonical-services.mjs` | New `@Injectable` must claim a domain from CANONICAL_DOMAINS |

All six run on every `npm run prepush:scoped` and on CI. The escape hatch
(`canonicalization-allow: …`) requires signed review.

---

## What remains for future sessions

The OmniCore core is sealed. Outstanding work is now ratchet-driven, not
foundational. In rough priority order:

1. **Drop the brain shim layer** once every consumer has been audited as
   importing the `Mind*` canonical name directly. Shims stay until the
   import graph proves they're orphans.
2. **Final `MIND_EVENT_ALIASES` retirement** — bump from dual-emit to
   single-emit once all emitters are confirmed canonical and a CI gate
   blocks the legacy names entirely.
3. **CAPABILITY_MAP refresh** — re-baseline duplicates after the mass
   move, so the gate continues to flag *new* drift, not historical drift.
4. **Frontend WhatsApp API surface audit** — `FRONTEND_WHATSAPP_API_AUDIT.md`
   already exists; finish the dead-export sweep (28 already dropped).
5. **Worker canonical audit** — `WORKER_*` canonical follow-up
   (`fd51701fd docs(worker): canonical audit + plan` is the entry point).
6. **`prismaAny` zeroing** — ratchet target `prisma_any_max: 0`.
7. **WhatsappModule path-final** — module file already moved; only the
   barrel-export polish remains for `@/marketing/channels/whatsapp`.

None of the above is blocking. The codebase boots, the gates green, the
shell is intact.

---

## Architecture wins — lessons learned

- **Move first, alias second, drop third.** Every migration followed the
  same three-phase rhythm: file is moved with imports updated in one
  commit → shim re-exports the new path at the legacy location → shim
  drops once consumers have all been audited. Zero broken-import windows.
- **Canonical gates ship with the migration**, not after. Each new gate
  landed in the same wave as the move it guards. The codebase never
  reached "structurally clean but mechanically un-defended."
- **ADR is the contract.** Both ADR-0012 and ADR-0013 named the topology
  *before* a single file moved. The migration commits cite the ADR; the
  ADR cites the canonical vocabulary; the vocabulary cites the gate. The
  loop is closed and self-auditing.
- **One sentence shells.** A folder name is a contract with future
  contributors. `backend/src/whatsapp/` told contributors "WhatsApp is
  a domain." `backend/src/marketing/channels/whatsapp/` tells them
  "WhatsApp is a channel under marketing." Same code, opposite story.
- **Append-only migrations.** No `git restore`, no force-push, no
  rewrites. ~140 atomic commits. Every step is reviewable and reversible.
- **Brain → Mind shows the pattern generalizes.** OmniCore (channels)
  and Mind (cognition) are different domains with the same topology
  problem and the same solution. The pattern is now reusable for any
  future top-level-domain-that-should-have-been-a-submodule mistake.

---

## Acknowledgments

This mission was executed under the contracts in:

- [ADR-0012 — Kloel OmniCore: channel unification under marketing umbrella](../adr/0012-kloel-omnicore-channel-unification.md)
- [ADR-0013 — Kloel Mind: unification of Brain, AI-Brain, CIA, and Mind](../adr/0013-kloel-mind-unification.md)
- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md)
- [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md)
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md)
- [DEPRECATION_MAP.md](DEPRECATION_MAP.md)
- [ANTI_REGRESSION_GATES.md](ANTI_REGRESSION_GATES.md)

The casca is intact. The motor breathes one language.
**OmniCore is alive.**

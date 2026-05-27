# ADR 0014: Channel Send Result & Capability Unification

- **Status:** Proposed (awaiting Daniel ratification)
- **Date:** 2026-05-27
- **Author:** Kloel orchestrator + Wave 3 subagent A findings (Wave 4 subagent F drafted)
- **Supersedes:** none
- **Complements:** ADR-0012 (Kloel OmniCore — channel unification under marketing umbrella)
- **Related rows:** `docs/architecture/DEPRECATION_MAP.md` row #40
  (`ChannelSendResult` / `ChannelCapability` duplication), surfaced from
  `docs/architecture/DUPLICATION_REGISTER.md` lines 90–91.

---

## 1. Context

ADR-0012 (Kloel OmniCore) mandates that **all outbound channel dispatch flows
through the canonical port** at
`backend/src/common/channel-dispatch/channel-dispatch.port.ts`. That port
defines:

- `ChannelKind` (enum) — the canonical channel discriminator.
- `ChannelSendInput` — discriminated union per channel.
- `ChannelSendResult` — the canonical result envelope.
- `ChannelCapability` — the canonical capability descriptor.
- `ChannelDispatchPort` — the contract every adapter implements.

However, `backend/src/kloel/channel-transport.types.ts` pre-dates the canonical
port (it shipped with the original Kloel transport providers in
`backend/src/kloel/channel-transport.providers.ts`) and exposes its own
`ChannelName`, `ChannelSendRequest`, `ChannelSendResult`, `ChannelCapability`
and `ChannelTransportProvider` shapes.

`tools/canonicalize/scan.mjs` therefore flags two duplicate exports
(`DUPLICATION_REGISTER.md` rows for `ChannelSendResult` and `ChannelCapability`,
each appearing in 2 files). Wave 3 subagent A surfaced these as duplication #40
in the prioritized backlog.

### 1.1 Field-by-field divergence

| Aspect | Canonical port<br>(`common/channel-dispatch`) | Kloel transport<br>(`kloel/channel-transport.types.ts`) |
|---|---|---|
| Channel identifier | `ChannelKind` enum (string-valued) | `ChannelName` string union |
| Channels listed | `WHATSAPP`, `INSTAGRAM`, `MESSENGER`, `FACEBOOK`, `EMAIL`, `INTERNAL_PARTNERSHIP`, `INTERNAL_ADMIN` | `whatsapp`, `instagram`, `messenger`, `tiktok`, `email` |
| Symmetric difference | `FACEBOOK`, `INTERNAL_PARTNERSHIP`, `INTERNAL_ADMIN` (canonical only) | `tiktok` (kloel only) |
| `ChannelSendResult.success` | required `boolean` | required `boolean` |
| `ChannelSendResult.messageId` | optional `string` | optional `string` |
| `ChannelSendResult.error` | optional `string` | optional `string` |
| `ChannelSendResult.blocked` | **optional** `boolean` | **required** `boolean` |
| `ChannelSendResult.blockedReason` | optional `string` | optional `string` |
| `ChannelSendResult.queued` | optional `boolean` | absent |
| `ChannelSendResult.delivery` | optional `'direct' \| 'queued'` | absent |
| `ChannelSendResult.externalId` | optional `string` | absent |
| `ChannelSendResult.provider` | optional `string` | absent |
| `ChannelCapability.channel` | `ChannelKind` enum | `ChannelName` string union |
| `ChannelCapability.sendAvailable` | required `boolean` | required `boolean` |
| `ChannelCapability.sendBlockedReason` | required `string \| null` | required `string \| null` |
| `ChannelCapability.requiredSetup` | required `string[]` | required `string[]` |
| Adapter contract | `ChannelDispatchPort` with `send(input: ChannelSendInput)` | `ChannelTransportProvider` with `send(workspaceId, request: ChannelSendRequest)` |
| Imported by | Channel dispatch registry + adapters (`backend/src/common/channel-dispatch/**`, OmniCore consumers) | Kloel transport providers (`backend/src/kloel/channel-transport.providers.ts`) and Mind action layer |

### 1.2 Why this matters

1. **Two parallel type universes for one capability.** OmniCore mandates one
   contract. Today, anyone wiring a new channel must choose, and both choices
   are wrong (`kloel/channel-transport.types.ts` lacks queue/delivery metadata;
   the canonical port lacks `tiktok`).
2. **Drift risk.** A field added to one shape silently diverges from the other
   until somebody runs the canonicalize scanner. Most authors do not.
3. **Consumer onboarding cost.** A new adapter author must read both files,
   reverse-engineer which to honor, and pick. This is the canonical "two
   sources of truth" anti-pattern that ADR-0012 promised to retire.
4. **ADR-0012 incomplete.** OmniCore wave 21 stopped at the dispatch boundary;
   the legacy kloel-transport shapes were left behind because changing them
   would touch ~10 kloel call-sites + 5 transport providers + Mind action layer
   in one PR.

The cost of **not** resolving is permanent dual-source ambiguity inside the
exact subsystem ADR-0012 was supposed to canonicalize.

---

## 2. Decision (Proposed — needs Daniel approval)

Two options are presented. The author recommends **Option A**.

### 2.1 Option A — Expand the canonical (PREFERRED)

1. **Add `TIKTOK = 'tiktok'`** to `ChannelKind` in
   `backend/src/common/channel-dispatch/channel-dispatch.port.ts`.
2. **Tighten `ChannelSendResult.blocked` to required `boolean`** (defaulting to
   `false` in successful sends). Required is safer: every consumer is forced to
   reason about the policy gate, no implicit truthy fallback.
3. **Keep `queued`, `delivery`, `externalId`, `provider` as optional metadata
   fields** on the canonical `ChannelSendResult`. They describe the *how*
   (transport-level facts) rather than the *what* (gate decision), so optional
   is correct.
4. **Add a typed alias** `export type ChannelName = `${ChannelKind}`` so that
   existing ergonomic string-destructuring in Mind / autopilot code keeps
   compiling without a sweeping rename.
5. **Migrate `kloel/channel-transport.types.ts` to a thin re-export shim** that
   forwards `ChannelSendResult`, `ChannelCapability`, `ChannelName`, and a
   `ChannelSendRequest` adapter type (Kloel's `ChannelSendRequest` differs from
   the canonical `ChannelSendInput` in shape, but can be expressed as a
   workspace-scoped wrapper without duplicating the result/capability shapes).
6. **Update consumers** — kloel transport providers, Mind action layer, and
   any Kloel callers — to import from the canonical port.
7. **Delete the duplicate exports** after grep confirms zero non-shim
   consumers.

**Estimated blast radius:**
- ~10 files in `backend/src/kloel/` (transport providers + Mind action layer
  + tool executor types).
- 5 transport adapters (`WhatsAppChannelTransport`, `InstagramChannelTransport`,
  `MessengerChannelTransport`, `EmailChannelTransport`,
  `TikTokChannelTransport`).
- 0 frontend files (verified — `grep -rn 'ChannelSendResult\|ChannelCapability'
  frontend/src` returns zero hits today).
- 0 worker files for the canonical types (worker has its own
  `worker/providers/channel-dispatcher.ts` which is a separate concern not
  covered by this ADR).

### 2.2 Option B — Rename and keep both

1. Rename Kloel variants to `KloelChannelSendResult` / `KloelChannelCapability`
   / `KloelChannelName`.
2. Both type universes coexist; the canonical port stays as-is, Kloel transports
   keep their richer-required-`blocked` shape, and the dual existence is
   declared **intentional** in this ADR plus `DEPRECATION_MAP.md`.
3. Add a `tiktok` field to the canonical `ChannelKind` only if/when needed by an
   OmniCore consumer.

**Estimated blast radius:** zero functional changes. Rename + JSDoc only.

**Cost:** lasting ambiguity — every author has to learn "which one do I use
here". Long-term tech debt that compounds with every new channel. Defeats the
ADR-0012 intent.

---

## 3. Recommendation

**Adopt Option A.** Single type universe for channel dispatch is the long-term
win. The 10-file migration is bounded and mechanically auditable.

---

## 4. Consequences

### 4.1 Positive

- Single canonical contract for `ChannelSendResult` + `ChannelCapability` +
  `ChannelKind`, honored by every adapter (kloel transports included).
- `tools/canonicalize/scan.mjs` stops flagging `ChannelSendResult` and
  `ChannelCapability` (duplication #40 closes).
- ADR-0012 OmniCore intent reaches its logical conclusion: one entry point AND
  one type universe.
- New channel authors read one file
  (`backend/src/common/channel-dispatch/channel-dispatch.port.ts`).

### 4.2 Negative

- Migration touches ~16 files; coordinator + downstream consumers must align
  in a single PR (or a small batched series).
- `blocked` becoming required forces every existing return-site to add a
  literal `blocked: false` where it previously relied on `undefined`.
- The discriminated-union strictness in `ChannelSendInput` means kloel
  transports cannot keep using the workspaceId-scoped `ChannelSendRequest`
  shape directly — they will need a small wrapper that maps Kloel's
  `(workspaceId, request)` calling convention onto the canonical
  `ChannelSendInput`.

### 4.3 Neutral

- `ChannelName` survives as a typed alias of `ChannelKind`, so any code path
  that destructures by string literal keeps compiling.

---

## 5. Migration Plan (Option A)

Each step is a **separate PR** to keep blast radius bounded.

### Step 1 — Expand the canonical (mechanical, ~30 min)

- Add `TIKTOK = 'tiktok'` to `ChannelKind`.
- Tighten `ChannelSendResult.blocked` to required `boolean`.
- Add the `ChannelName` typed alias.
- Update every canonical-side consumer to set `blocked: false` (or `true` with
  reason) explicitly.
- Run `npm run typecheck && npm run lint` in backend.
- Ship as one PR titled `feat(channel-dispatch): expand canonical
  ChannelSendResult per ADR-0014 step 1`.

### Step 2 — Deprecate Kloel variants (docs only, ~10 min)

- Add `@deprecated` JSDoc to `ChannelSendResult`, `ChannelCapability`,
  `ChannelName`, `ChannelSendRequest`, `ChannelTransportProvider` in
  `backend/src/kloel/channel-transport.types.ts`, pointing to canonical port.
- Update `DEPRECATION_MAP.md` row for #40 to "Step 2 — JSDoc-marked, awaiting
  consumer migration".
- Ship as `docs(deprecation): mark kloel/channel-transport.types as @deprecated
  per ADR-0014 step 2`.

### Step 3 — Migrate consumers (codemod-assisted, ~1 h)

- Replace imports from `./channel-transport.types` with imports from
  `../common/channel-dispatch/channel-dispatch.port` in every kloel transport
  provider and Mind action layer file.
- Map `ChannelSendRequest` → `ChannelSendInput` via per-channel adapter
  helpers (small switch on `channel` field).
- Update `ChannelTransportProvider` implementers to satisfy
  `ChannelDispatchPort` (rename `channel` to `channelKind`, accept
  `ChannelSendInput`).
- Run `npm run typecheck`, `npm run lint`, full Jest, and the new Step 5 gate.
- Ship as `refactor(kloel): migrate channel transports to canonical
  ChannelDispatchPort per ADR-0014 step 3`.

### Step 4 — Delete duplicates (~10 min)

- After `grep -rn 'from .*channel-transport.types' backend/src` returns zero
  hits, delete the duplicate declarations from
  `backend/src/kloel/channel-transport.types.ts` (keep file only if other
  non-duplicated types live there; otherwise delete the file).
- Update `DUPLICATION_REGISTER.md` and `DEPRECATION_MAP.md` to mark #40 as
  RESOLVED.
- Ship as `chore(kloel): remove duplicated ChannelSendResult/ChannelCapability
  per ADR-0014 step 4`.

**Estimated total effort:** ~2 focused hours across 4 PRs.

---

## 6. Verification

After Step 4 lands:

1. `node tools/canonicalize/scan.mjs` no longer lists `ChannelSendResult` or
   `ChannelCapability` in `DUPLICATION_REGISTER.md`.
2. `cd backend && npm run typecheck` — clean.
3. `cd backend && npm run lint` — clean.
4. `cd backend && npm test -- channel-dispatch` — green.
5. `cd backend && npm test -- channel-transport` — green.
6. `cd backend && npm test -- mind` — green (Mind action layer still wires).
7. `grep -rn 'ChannelSendResult\|ChannelCapability' backend/src` — only the
   canonical port file matches the declaration; everything else imports.

---

## 7. Rollback

If any consumer migration breaks a channel adapter:

1. Revert the offending PR (`git revert <sha>`).
2. Keep Steps 1 + 2 (expand + deprecate) — they are additive and safe.
3. Re-plan Step 3 into per-channel sub-PRs (one channel at a time) to shrink
   the blast radius further.
4. If Step 1 itself causes regressions (`blocked` required breaks an
   adapter), revert Step 1 and reopen Option B for discussion.

Adapter-level rollback is always possible because every step preserves the
canonical port's runtime semantics — only the type surface tightens.

---

## 8. Open Questions

1. **Should `ChannelName` be preserved as a typed alias?** Author proposal:
   yes — `export type ChannelName = \`${ChannelKind}\`` is a typed runtime
   equivalent and avoids a massive string-literal sweep across Mind / Kloel
   tool executor code. Cost: zero ergonomic regression. Benefit: keeps PRs
   small. Awaiting Daniel ratification.

2. **Frontend mirror types?** Confirmed via
   `grep -rn 'ChannelSendResult\|ChannelCapability' frontend/src` — zero hits
   today. The frontend uses its own thin API client shapes
   (`frontend/src/lib/api/whatsapp.ts`, `marketing.ts`, etc.) that are not
   coupled to the backend port. No frontend migration is required by this ADR.

3. **Worker-side handlers?** `worker/providers/channel-dispatcher.ts` exists
   but is a worker-local concern (`sendEmail`, `channelEnabled`) that does
   not import the canonical port types. Out of scope for ADR-0014. A
   separate follow-up ADR may unify the worker dispatcher with the canonical
   port if/when ADR-0012 OmniCore is extended into the worker boundary.

4. **`ChannelSendRequest` vs `ChannelSendInput`.** Kloel's
   `ChannelSendRequest` is workspace-scoped `(workspaceId, request)`; the
   canonical port uses a flat `ChannelSendInput` discriminated union with
   `workspaceId` inside the union member. Step 3 needs a tiny adapter helper.
   Author proposal: define `toChannelSendInput(workspaceId, request)` inside
   each transport provider (private), not as a public utility — keeps the
   canonical port surface clean.

5. **`MindActionContext.guardContext` propagation.** Kloel's
   `ChannelSendRequest.guardContext` (Mind action context) has no canonical
   counterpart. Author proposal: pass `guardContext` via the per-channel
   discriminated union (add an optional field on each WhatsApp / Instagram /
   Messenger / Email / TikTok input shape) rather than promote it to the
   canonical `ChannelSendResult`. Decided in Step 1.

---

## 9. References

- `docs/architecture/DEPRECATION_MAP.md` row #40 (added by this ADR).
- `docs/architecture/DUPLICATION_REGISTER.md` lines 90–91 (`ChannelSendResult`,
  `ChannelCapability`).
- `docs/architecture/CANONICALIZATION_MISSION.md`.
- `docs/architecture/CAPABILITY_MAP.md` — Channel Dispatch row.
- `docs/architecture/CHANNEL_DISPATCH_CANONICAL.md` — 44 call-site catalogue.
- `docs/adr/0012-kloel-omnicore-channel-unification.md` — OmniCore mandate.
- `backend/src/common/channel-dispatch/channel-dispatch.port.ts` — canonical port.
- `backend/src/kloel/channel-transport.types.ts` — duplicate shapes targeted
  for migration.
- `backend/src/kloel/channel-transport.providers.ts` — 5 transport providers
  to be migrated in Step 3.

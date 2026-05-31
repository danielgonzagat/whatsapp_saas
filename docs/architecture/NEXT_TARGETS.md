# Next High-Value Refactor Targets

> **Audit date**: 2026-05-27 (Wave 34 subagent C, post-ADR-0012 OmniCore completion)
> **Branch**: `codex/backlog-consolidation-production-v2`
> **Goal**: identify the next 5 highest-value canonicalization refactors now
> that the WhatsApp dissolution is done.

---

## Current state — canonical gates

| Gate | Status | Notes |
|---|---|---|
| `check-canonical-duplicates` | OK (17 capabilities, 0 regressions) | Clean. |
| `check-canonical-events` | OK (39 events, all canonical/system) | Clean. |
| `check-canonical-services` (DUP, soft) | 7 duplicates without alias, 584/606 classes missing `@cluster` | **Two real action items below**. |
| `check-canonical-vocabulary` (soft) | 707 alias usages across 4 canonical terms | `connection`/`User`/`Account`/`Hook` aliases still rampant. |
| `check-canonical-waha` | OK (0 direct WAHA imports outside channel boundary) | Clean. |
| `check-no-direct-brain-imports` | WARN (1 leak: `unified-agent-actions-messaging.service.spec.ts`) | Trivial fix; isolated to a spec. |
| `check-cross-boundary-utils-drift` | OK (13/13 within tolerance) | Clean. |

## Evidence — codebase state

- Backend `@Injectable` classes: **606** (599 unique).
- Backend `@deprecated` symbols: **67 occurrences across 64 files** — 29 of them are
  `@deprecated` alias re-export stubs at `backend/src/kloel/{mind-,brain-,whatsapp-brain}*.ts`
  representing the ADR-0013 Wave M1 alias window.
- Largest active (non-deprecated) legacy files still living at `backend/src/kloel/`
  root instead of inside `kloel/mind/{coordination,observability,policy,...}/`:
  - `mind-controller.spec.ts` (476) — `kloel/mind/coordination/` peer is the canonical home.
  - `brain-runtime.service.spec.ts` (375), `whatsapp-brain.service.spec.ts` (355).
  - `brain-event-spine.diagnostics.spec.ts` (350), `mind-code-native-services.spec.ts` (338).
  - `brain-event-spine.service.spec.ts` (337), `mind-controller.dto.ts` (327),
    `brain-event-taxonomy.ts` (327), `brain-capability-executor.substrate.ts` (326),
    `mind-controller.ts` (315), `mind-catalog-decision-resolvers.ts` (296).
- ~10,407 LOC across all `kloel/{mind-,brain-,whatsapp-brain}*` files; ~3,000+ LOC
  is in deprecated alias stubs (≤14 LOC each, 29 files), the rest is real
  implementation that ADR-0013 plans to move into the `kloel/mind/` subtree.

---

## TOP 5 next refactors (ranked by leverage / risk ratio)

### 1. Physically move ADR-0013 Wave M1 implementations into `kloel/mind/coordination/`

**What**: Today, files like `backend/src/kloel/brain-capability-executor.service.ts`
(551 LOC) carry the real implementation, and the "canonical" file at
`backend/src/kloel/mind/coordination/mind-capability-executor.service.ts` is a
17-line re-export pointing back to it (inverted alias). Migrate the impl into
`mind/coordination/`, leave the `brain-*` path as the thin re-export stub
(symmetric to the Wave M5 pattern for `ai-brain/*` → `mind/knowledge/*`).

**Files in scope** (all currently `@deprecated` re-export stubs that need their
impl side flipped):

- `kloel/brain-capability-executor.service.ts` (551 LOC) → `kloel/mind/coordination/mind-capability-executor.service.ts`
- `kloel/brain-event-spine.service.ts` (488 LOC) → `kloel/mind/coordination/mind-event-spine.service.ts`
- `kloel/brain-runtime.service.ts` (490 LOC) → `kloel/mind/coordination/mind-runtime.service.ts`
- `kloel/brain-commercial-graph.service.ts` (393 LOC) → `kloel/mind/coordination/mind-commercial-graph.service.ts`
- `kloel/whatsapp-brain.service.ts` (187 LOC) → `kloel/mind/coordination/whatsapp-mind-coordinator.service.ts`
- `kloel/brain-autonomy.service.ts` (68 LOC) → `kloel/mind/coordination/mind-autonomy-coordinator.service.ts`
- `kloel/brain-capability-registry.service.ts` (87 LOC) → `kloel/mind/coordination/mind-capability-registry.service.ts`
- `kloel/kloel-lead-brain.service.ts` → `kloel/mind/coordination/lead-mind-coordinator.service.ts`

**Effort**: M–L (6–8 files, ~2,300 LOC of real impl; spec moves + import depth
rewrites; barrel already wired). Use `git mv` to preserve rename history.

**Blast radius**: Wide consumers across `backend/src/{kloel,omnichannel,products,plans,admin,marketing}`.
Most already type-import via the `kloel/mind/coordination` barrel (good); only
deep internal `./brain-event-spine.service` / `./brain-runtime.service` sibling
imports inside `kloel/` itself need rewiring. ~30 inner consumers.

**Risk**: Medium. Module DI must remain wired; backend boot. Mitigated by the
existing alias stub pattern — the legacy `brain-*` file becomes a 13-line
re-export shim, identical to how `kloel/mind-*` legacy stubs already work
(Wave M1 row #18 etc.). Backend `tsc` is the gate; ~9 specs in scope to keep
green.

---

### 2. Resolve the **2 hypproof self-dups** (same folder, same class name)

**What**: `backend/src/kloel/hypproof/experiment-runner.service.ts` (97 LOC) and
`backend/src/kloel/hypproof/experiment-runner.ts` (97 LOC) both export class
`ExperimentRunnerService` — same name, same folder, but **different APIs**
(`run(experiment, observedEvents)` vs `start(experiment, authorization)`).
Same pattern for `proof-evaluator.service.ts` vs `proof-evaluator.ts`. This is
a genuine source of bugs: which `ExperimentRunnerService` does a consumer get?

**Files in scope**:

- `backend/src/kloel/hypproof/experiment-runner.service.ts` vs `…/experiment-runner.ts`
- `backend/src/kloel/hypproof/proof-evaluator.service.ts` vs `…/proof-evaluator.ts`

**Effort**: S (4 files, ~388 LOC, both pairs in one folder). Pick the
authoritative API, delete the loser, update `hypproof.module.ts` providers,
keep the spec that asserts the kept API.

**Blast radius**: Very small (single folder).

**Risk**: Low. Two specs already exist (`*.service.spec.ts` + `hypproof.spec.ts`).
Audit which call site uses which API surface before deciding which is the
canonical signature. Workspace isolation not at risk.

---

### 3. Unify `WalletService` — financial duplicate, **highest risk**

**What**: Two real `@Injectable` `WalletService` classes:

- `backend/src/kloel/wallet.service.ts` (668 LOC) — used by `checkout/__tests__/financial-scenarios.spec.ts` (1 consumer).
- `backend/src/wallet/wallet.service.ts` (504 LOC) — used by 10+ consumers
  (`ai-brain/agent-assist.helpers*`, `kloel/site.controller.ts`, etc.).

Two different wallet implementations with the same class name is a **financial
risk**: any DI mistake routes money operations to the wrong ledger. CLAUDE.md
treats Wallet/ledger as append-only and Tier-1 risk surface.

**Effort**: M. Either (a) merge `kloel/wallet.service.ts` into
`wallet/wallet.service.ts` and keep the 1 consumer flipped, or (b) explicitly
rename one (e.g. `KloelWalletAssistService`) to make the distinction visible.
Need to read both files in full and reconcile their APIs.

**Blast radius**: 11 direct consumers + DI in two modules. Tests in
`checkout/__tests__/financial-scenarios.spec.ts`, `ai-brain/agent-assist.helpers.{charging,refund}.spec.ts`.

**Risk**: HIGH — money path. Mandatory: write a reconciliation note in
`docs/adr/` before the rename, and add a `DEPRECATION_MAP.md` row. Per
CLAUDE.md REGRA DE PAGAMENTOS, this needs a coverage proof before merge.

---

### 4. Delete 4 zero-consumer legacy stubs in `backend/src/meta/{instagram,messenger}/`

**What**: Post-ADR-0012 Wave W3 left 4 re-export stubs at:

- `backend/src/meta/instagram/instagram.service.ts` (9 LOC, `@deprecated`)
- `backend/src/meta/instagram/instagram.controller.ts` (9 LOC, `@deprecated`)
- `backend/src/meta/messenger/messenger.service.ts` (13 LOC, `@deprecated`)
- `backend/src/meta/messenger/messenger.controller.ts` (14 LOC, `@deprecated`)

`grep -rE "from ['\"][^'\"]*meta/(instagram|messenger)" backend/src --include='*.ts'`
returns **0 consumers**. The Wave W4 sunset condition is met.

**Effort**: XS (4 files, ~45 LOC, no spec impact). `git rm` + delete the
folders if empty + update `DEPRECATION_MAP.md` to "DELETED".

**Blast radius**: Zero (verified zero callers).

**Risk**: Trivial. Backend `tsc` is the only gate. ~5-minute task.

---

### 5. Vocabulary alias sweep — `connection → ChannelSession` (339 hits, biggest cluster)

**What**: `check-canonical-vocabulary` reports 707 soft warnings; the single
largest bucket is `connection` (339 occurrences) being used where the canonical
term is `ChannelSession`. Per `CANONICAL_VOCABULARY.md`:

> `ChannelSession` | `whatsappSession`, `waSession`, `connection`, `instance`, `botSession` | Authoritative session entity across all messaging channels

Note: many `connection` hits will be **legitimate** (Redis/BullMQ connection,
Prisma DB connection, socket connection). The codemod needs domain awareness —
only rename uses where the `connection` variable holds a
WhatsApp/Instagram/Messenger session object.

**Effort**: M. Heuristic codemod via `mcp__atomic-edit__atomic_rename_symbol_cross_file`
scoped to files that import from `marketing/channels/**` or that touch
`ChannelSession` Prisma model. Manually review each batch (~40 files at a time).

**Blast radius**: Wide (339 hits) but ~70% are likely false positives that the
gate already tolerates (soft mode). True high-leverage hits are concentrated in
`marketing/channels/`, `omnichannel/`, `kloel/mind/cia/`.

**Risk**: Low-Medium. No runtime behavior change — pure rename. Spec coverage
across affected files is solid. Visual contract NOT affected (backend only).

---

## Recommended execution order

| # | Target | Why this order |
|---|---|---|
| 1 | **#4 Meta stubs delete** (XS, trivial) | Free win, clears 4 `@deprecated` entries from the audit. Do first to warm up. |
| 2 | **#2 Hypproof dedup** (S, isolated) | Real bug class (same class name, different API). Small blast, no money path. |
| 3 | **#1 ADR-0013 M1 physical moves** (M-L, wide) | The biggest leverage refactor — un-inverts the alias direction and properly hosts ~2,300 LOC of real impl inside `kloel/mind/coordination/`. Per-file waves like ADR-0012 W3. |
| 4 | **#5 Vocabulary `connection` sweep** (M, wide) | Backend-only rename, no semantic change. Cuts 339/707 (48%) of vocabulary warnings in one wave. |
| 5 | **#3 WalletService unification** (M, HIGH risk) | Last — needs ADR draft, coverage proof, owner sign-off. Don't bundle with anything else. |

---

## Stop conditions (per CLAUDE.md)

- Any refactor touching `WalletService` requires ADR + ≥95% coverage gate per
  STRIPE PAYMENT BASELINE block. Halt and escalate if not provable.
- Any rename touching a protected file (see ARQUIVOS PROTEGIDOS) — halt.
- Backend `tsc` red after a wave — halt that wave, do not merge.
- ADR-0013 alias sunset dates (mostly `2026-06-24` / `2026-07-15`) are the
  outer clock; #1 should be done by `2026-06-24` to honor row #28 et al.

---

## See also

- [`CANONICALIZATION_DOD.md`](CANONICALIZATION_DOD.md) — mission scoreboard (9/11 done)
- [`DEPRECATION_MAP.md`](DEPRECATION_MAP.md) — current alias windows
- [`CANONICAL_VOCABULARY.md`](CANONICAL_VOCABULARY.md) — full alias dictionary
- `docs/adr/0013-kloel-mind-unification.md` — Wave M1–M6 plan
- `docs/adr/0012-kloel-omnicore-channel-unification.md` — just-completed reference

# Wave 43 — Macro Snapshot + Next 5 Targets

> **Snapshot date**: 2026-05-27 (Wave 43, subagent B)
> **Branch**: `codex/backlog-consolidation-production-v2`
> **HEAD**: `f891bf14a`
> **Predecessor**: [`NEXT_TARGETS.md`](./NEXT_TARGETS.md) (Wave 34 audit)
> **Goal**: refresh macro state via direct queries, identify next 5 high-value
> targets after a heavy refactor day, recommend Wave 44+ plan.

---

## 1. Snapshot stats (live, command-driven)

| Metric | Value | Source |
|---|---|---|
| Commits today (since 06:00) | **175** | `git log --since="06:00" --oneline \| wc -l` |
| Backend TSC errors | **0** | `npx tsc --noEmit \| wc -l` |
| Canonical vocab — hard violations | **0** | `node scripts/ops/check-canonical-vocabulary.mjs` |
| Canonical vocab — soft warnings | **562** (was 707 in Wave 34) | same |
| Direct `brain-*` imports outside `mind/` | **0** (gate green) | `check-no-direct-brain-imports` |
| Cross-boundary utils drift pairs | **0 hard / 13 within tolerance** | `check-cross-boundary-utils-drift` |
| `mind/coordination/` canonical services | **8** | `find backend/src/kloel/mind/coordination -name '*.service.ts'` |
| Remaining `brain-*.service.ts` stubs at root | **6** (all 6–17 LOC re-export shims) | `find backend/src/kloel -maxdepth 1 -name 'brain-*.service.ts'` |
| Backend controllers | **161** | `grep -l "@Controller" backend/src/**/*.controller.ts` |
| `@deprecated` symbols in backend | **61 files** | `grep -lE "@deprecated\|legacy alias" backend/src -r` |
| Backend top-largest TS file | `capability-registry-v2.const.ts` — 2288 LOC | `wc -l \| sort -rn` |

### Soft vocab warnings breakdown (562 total)

| Canonical | Aliases hitting it | Count |
|---|---|---|
| `Contact` | `User` (90) · `Customer` (49) · `Lead` (74) · `Client` (35) | 248 |
| `ChannelSession` | `connection` (198) · `instance` (44) | 242 |
| `Workspace` | `Account` (62) · `Tenant` (1) | 63 |
| `Webhook` | `Callback` (5) · `Hook` (4) | 9 |

Down from 707 in Wave 34 → **145 alias removals in today's batches 1–6**
(`connection → ChannelSession` series, plus `customerMessage → contactMessage`).

---

## 2. What today's 175 commits delivered

| Theme | Evidence (sampled commits) |
|---|---|
| ADR-0013 M1 alias flip COMPLETE | `e72a93a53` (close the brain canonical loop), `9727ccb16` (whatsapp-brain + kloel-lead-brain flipped), `4655d894f` (commercial-graph), `4cf8166e7` (runtime), `4169c8335` (event-spine), `30f959ada` (capability-registry), `af5b61b13` (autonomy) |
| Canonical vocabulary sweep (6 batches) | `ec3e6eae2`, `9470e4833`, `6773bc067`, `b45f1ee2a`, `36b4ac735`, `49cf54c38` (all `connection → ChannelSession`) |
| Payment routing hygiene | `1c8c14c4a`, `9151fa5f0`, `f125c85fb`, `446017205`, `e12d1673a`, `07e1425e4`, `edb17d4e8` (pix/boleto → mercado pago; remove fake fallbacks) |
| Frontend dedup | `e4ce29a29` (drop 9 unused `whatsappApi` duplicates) |
| Hypproof dedup | `c4f0a4d8a` (experiment-runner + proof-evaluator collapsed) |
| OmniCore complete | `84a1b6986` (delete `backend/src/whatsapp/` — ADR-0012 W4 done) |
| Governance | `a7f3c639a` (ADR-0015 WalletService proposed), `ca6690e09` (DEPRECATION_MAP row #56) |

ADR-0013 Wave M1 alias-flip mission (NEXT_TARGETS.md item #1) is **structurally
complete** for the 6 brain-* services + whatsapp-brain + lead-brain. All 6
remaining `brain-*.service.ts` files at the kloel root are now thin
`@deprecated` re-exports pointing at `kloel/mind/coordination/`.

---

## 3. Top 5 next high-value targets (Wave 44+ candidates)

### Target 1. Flip `brain-*` *non-service* impl files into canonical layout — XS-S each

The service flip is done, but **9 sibling brain-* files still hold real impl
at the legacy `kloel/` root** (verified `head -3 | grep deprecated` returned
empty for each):

| File | LOC | Suggested canonical home |
|---|---|---|
| `backend/src/kloel/brain-event-taxonomy.ts` | 327 | `kloel/mind/coordination/event-taxonomy.ts` |
| `backend/src/kloel/brain-capability-executor.substrate.ts` | 326 | `kloel/mind/coordination/capability-executor.substrate.ts` |
| `backend/src/kloel/brain-runtime.controller.ts` | 206 | `kloel/mind/coordination/runtime.controller.ts` (or stay — controllers historically don't move) |
| `backend/src/kloel/brain-commercial-graph.persistence.ts` | 120 | `kloel/mind/coordination/commercial-graph.persistence.ts` |
| `backend/src/kloel/brain-capability-policy.ts` | 94 | `kloel/mind/coordination/capability-policy.ts` |
| `backend/src/kloel/brain-runtime.dto.ts` | 79 | `kloel/mind/coordination/runtime.dto.ts` |
| `backend/src/kloel/brain-decide-degrade.filter.ts` | 78 | `kloel/mind/coordination/decide-degrade.filter.ts` |
| `backend/src/kloel/brain-capability-executor.substrate.helpers.ts` | 74 | colocate |
| `backend/src/kloel/brain-capabilities.const.ts` | 41 | colocate |

Plus **12 brain-* spec files** still at `kloel/` root importing the legacy
shim (`import { BrainRuntimeService } from './brain-runtime.service'`). Each
needs its import rewritten to the canonical path so it actually exercises the
canonical class identifier.

**Why high value**: closes ADR-0013 Wave M1 fully. Eliminates one whole
generation of legacy-path impl files (~1,345 LOC). Per-file git mv preserves
history. Risk: low (TSC + barrel already wired).

---

### Target 2. Flip `mind-*` legacy impl files (the harder batch) — M

`backend/src/kloel/` still hosts **a much bigger pool of `mind-*` impl files**
that pre-date the `mind/policy/`, `mind/coordination/`, `mind/perception/`
subtree split. Sampling confirmed STUB vs IMPL classification:

- **STUBS (already flipped, just re-exports)**: `mind-bandit`, `mind-belief`,
  `mind-case-memory`, `mind-concepts`, `mind-policy`, `mind-event-processor`,
  `mind-perception`, `mind-processor`, `mind-observability`.
- **IMPL still at legacy root**:
  - `mind-controller.ts` (315 LOC) + `mind-controller.spec.ts` (476) + `mind-controller.dto.ts` (327)
  - `mind-catalog-decision-resolvers.ts` (296) + `.spec.ts`
  - `mind-code-native.types.ts` (79) + `mind-code-native-services.spec.ts` (338)
  - `mind-decision-baselines.ts` (188) + `mind-decision-catalog.ts` (136)
  - `mind-policy-calculation.ts` (231), `mind-policy.helpers.ts` (183), `mind-policy.wisdom-prior.helpers.ts` (157)
  - `mind-recovery-decision-resolvers.ts` (139), `mind-commercial-decision-resolvers.ts` (247)
  - `mind-belief-by-channel.ts` (28), `mind-case-memory-decision.helper.ts` (75)
  - `mind-cross-workspace-isolation.spec.ts`

51 `mind-*` files total at the legacy path. Pick the canonical home per file
(`mind/coordination/`, `mind/policy/`, `mind/inference/`, `mind/memory/`)
based on the actual subject. Suggested wave size: **8–12 files per batch**.

**Why high value**: the `mind/` subtree is the single largest topology in the
kloel module. Finishing the move turns `kloel/` into a thin shell of
re-exports + controllers + `mind/` proper.

---

### Target 3. Vocabulary sweep — `Contact` aliases (248 hits, biggest remaining cluster) — M

Today's 6 batches knocked the `connection → ChannelSession` pile from 339 down
to 198. The next biggest is **Contact**:

- `User` (90), `Lead` (74), `Customer` (49), `Client` (35) = 248 occurrences.

Heuristic: most `User` hits will be legitimate (auth `User` Prisma model,
session user). `Lead`/`Customer`/`Client` hits are more likely true aliases in
CRM/sales/checkout code. Same codemod pattern proven in batches 1–6 today.

**Why high value**: cuts soft warning count by **~44%** (248/562). Pure
rename, no runtime change.

---

### Target 4. Decompose top 4 over-size files (>1000 LOC) — M-L

| File | LOC | Suggested decomp |
|---|---|---|
| `kloel/capability-registry-v2/capability-registry-v2.const.ts` | 2288 | split per capability cluster into multiple const files |
| `kloel/kloel-tool-dispatcher.service.ts` | 1578 | extract per-tool-family dispatchers (chat-tools / business-config-tools / etc. already exist as sibling services) |
| `kloel/guest-chat.action-intent.helpers.ts` | 1108 | split per intent class |
| `checkout/checkout-payment.service.ts` | 1046 | extract per-provider strategies (mercado-pago / stripe / boleto) |

**Why high value**: these are concentration risks. `kloel-tool-dispatcher`
specifically is the single hottest file in the agent path, with **931 LOC of
chat-tools spec** already split out (proven decomp pattern). Per CLAUDE.md
"NÃO reescrever uma tela inteira sem necessidade", do these surgically — not
all at once.

**Risk**: M (big files = wide blast). Mitigated by extensive spec coverage on
each (1578-line dispatcher has 741 + 931 LOC of dedicated specs). Decompose
behind unchanged public API; verify via existing specs.

---

### Target 5. ADR-0015 WalletService unification — **BLOCKED on owner ratification**

Status (from `docs/adr/0015-wallet-service-unification.md` line 3):

> **Status:** Proposed (awaiting Daniel ratification — NO migration begins
> before this ADR is ratified)

Two `WalletService` classes still coexist at:

- `backend/src/wallet/wallet.service.ts` (504 LOC, 10+ consumers)
- `backend/src/kloel/wallet.service.ts` (668 LOC, 1 consumer — checkout financial-scenarios spec)

ADR-0015 documents that these are **not duplicates** — they're two distinct
money paths sharing a class name. Investigation-only, zero code change until
ratified.

**Why on the top 5**: it remains the single highest-blast-radius
canonicalization target in the repo. Money path = SOX-grade. **Do not pick
this up autonomously** until Daniel signs ADR-0015 off. Listed here so Wave
44+ planners don't accidentally re-investigate.

---

## 4. Recommended Wave 44+ plan

Execution order weighs leverage vs. risk and respects the daily rhythm we
just landed (175 commits today, all canonical-flip + vocab + payment hygiene).

| Wave | Target | Effort | Why this slot |
|---|---|---|---|
| **44** | Target 1 — flip 9 `brain-*` non-service impl files + 12 specs | S-M | Lowest-risk, momentum from today's M1 service flips. ~1,345 LOC moved with `git mv`; barrels already wired. |
| **45** | Target 3 — Contact vocab sweep (split into 3–4 batches of ~60 alias-renames each, matching today's batch-1..6 cadence) | M | Same codemod pattern Daniel just shipped. Big soft-warning win (44% drop). |
| **46** | Target 2 — `mind-*` legacy impl flip (start with `mind-controller.ts` + `.dto.ts` + `.spec.ts` as Batch 1) | M-L | Largest pool. Use ADR-0013 M5 pattern. Per-batch waves of 8–12 files. |
| **47** | Target 4a — decompose `kloel-tool-dispatcher.service.ts` 1578 → ~6 sub-dispatchers | M | Hot agent path. Spec coverage proves correctness. |
| **48** | Target 4b — decompose `capability-registry-v2.const.ts` 2288 → per-cluster consts | M | Largest file in repo; no logic, pure data, lowest test friction. |
| **(gated)** | Target 5 — WalletService unification | HIGH | Only when ADR-0015 is ratified. Hard stop otherwise. |

### Stop conditions (per CLAUDE.md)

- Backend `tsc` red after a wave → halt that wave.
- Any rename touching a protected file (`backend/src/lib/ai-models.ts`,
  `eslint.config.mjs`, `.husky/pre-push`, `ops/*.json`, etc.) → halt.
- Any wave touching `wallet/wallet.service.ts` or `kloel/wallet.service.ts`
  → halt, escalate, ratify ADR-0015 first.
- Soft vocab warnings INCREASE after a sweep wave → revert that batch.

### Gate baseline to preserve

| Gate | Today's value | Required after each wave |
|---|---|---|
| `npx tsc --noEmit` (backend) | 0 errors | 0 |
| `check-canonical-duplicates` | OK | OK |
| `check-canonical-events` | OK | OK |
| `check-no-direct-brain-imports` | OK (0 leaks) | OK |
| `check-cross-boundary-utils-drift` | OK (13/13) | OK |
| `check-canonical-vocabulary` (soft) | 562 | ≤ previous |
| `check-canonical-vocabulary` (hard) | 0 | **0** (gate enforces) |

---

## 5. Outstanding observations

- **Concurrent agent activity**: working tree has uncommitted modifications
  to `PULSE_*` artifacts + 4 backend specs + a kloel helper. Not blocking
  this macro doc but worth noting that another agent is touching the repo
  (per CLAUDE.md regra: don't compete on the same files).
- **Hypproof dedup** (Wave 34 item #2) is **already done** today
  (`c4f0a4d8a`). Both `experiment-runner` and `proof-evaluator` collapsed.
- **Meta stubs delete** (Wave 34 item #4) is **already done** —
  `backend/src/meta/instagram/` and `backend/src/meta/messenger/` no longer
  on disk; 0 consumers verified.
- **ADR-0013 Wave M1** brain service flip (Wave 34 item #1, the biggest)
  is **structurally complete** — what remains is the sibling non-service
  files in Target 1 above.

So Wave 34's top 5 → 3 done + 1 blocked + 1 mostly done. This Wave 43 macro
picks up the natural next layer.

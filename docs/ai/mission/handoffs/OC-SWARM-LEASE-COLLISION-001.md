# Handoff: OC-SWARM-LEASE-COLLISION-001

## Worker ID
`OC-SWARM-LEASE-COLLISION-001`

## Objective Received
Audit lease quality for swarm scaling. Identify oversized leases, zero-owned leases, protected or critical surfaces in ownedFiles, duplicated ownership, and which 3-5 leases are safe for the next implementation wave. Recommend disjoint worker ownership and acceptance checks.

## Files Read
- `scripts/decomp/opencode-subagent-delegation-rules.md`
- `docs/ai/mission/MISSION_STATE_LEDGER.md`
- `docs/ai/mission/DECISION_GRAVEYARD.md`
- `.pulse/current/PULSE_CONTEXT_BROADCAST.json`
- `.pulse/current/PULSE_WORKER_LEASES.json`
- `ops/protected-governance-files.json`

## Files Changed
- `docs/ai/mission/handoffs/OC-SWARM-LEASE-COLLISION-001.md` (created)

## Hypothesis
The current lease topology (10 PULSE-generated leases, all `active`, TTL 30min) is unsuitable for swarm scaling because a single monolithic lease (pulse-worker-01) owns 580 files covering the entire backend + frontend, five leases own zero files (phantom workers), and the remaining leases that do have real disjoint ownership are small but overlapped in readOnly surfaces by 96-99%.

## Decision
**REJECTED for swarm scaling in current state.** The lease topology must be restructured before dispatching 3-5 real implementation workers. Specific findings and recommendations follow.

---

## Lease Quality Audit — Full Topology

```
Worker             Owned   ReadOnly   Conflicts   Risk-3   Safe for Wave?
─────────────────────────────────────────────────────────────────────────
pulse-worker-01     580        7          0          18     ** NO (monolith)
pulse-worker-02      26      541        534          0     YES (checkout/apple)
pulse-worker-03       4      558        551          0     YES (chat/admin-guard)
pulse-worker-04       0      562        555          0     NO (phantom)
pulse-worker-05       1        9          0          0     YES (health-probe)
pulse-worker-06       0        9          0          0     NO (phantom)
pulse-worker-07       0        8          0          0     NO (phantom)
pulse-worker-08       0        9          0          0     NO (phantom)
pulse-worker-09       0       10          1          0     NO (phantom)
pulse-worker-10       5      564        557          0     YES (cia-page)
```

### Finding 1: Oversized Lease (Critical)
**pulse-worker-01** owns 580 files — the entire `backend/src/**` surface (auth, payments, whatsapp, kloel, billing, checkout, CRM, flows, marketing, webhooks, admin, etc.) plus the entire `frontend/src/**` and `frontend-admin/src/**` tree. This is a single monolithic lock that prevents any other worker from owning these files. No swarm scaling is possible while this lease exists.

### Finding 2: Risk-3 Surface in Monolithic Lease (Critical)
All 18 risk-3 files (payments, wallet, ledger, billing, marketplace-treasury) are owned exclusively by pulse-worker-01:
- `backend/src/payments/connect/**` (connect-payout-approval, connect controller/service)
- `backend/src/payments/fraud/fraud.engine.ts`
- `backend/src/payments/ledger/**` (ledger.service, connect-ledger-reconciliation)
- `backend/src/payments/split/split.controller.ts`
- `backend/src/wallet/**` (wallet.service, prepaid-wallet.controller)
- `backend/src/marketplace-treasury/**` (payout, reconcile, service)
- `backend/src/billing/**` (billing service, webhook, plan-limits)

These should be isolated into dedicated lease(s) with validation contracts before any implementation wave touches them.

### Finding 3: Zero-Owned (Phantom) Leases
Five leases (pulse-worker-04, 06, 07, 08, 09) own zero files. They contribute nothing to parallelism and only exist as readOnly baggage carriers (each with 8-562 readOnly entries, almost all duplicating w1's ownership). These should be expired or collapsed.

### Finding 4: Protected/Governance Surfaces
**No protected governance files** appear in any lease's ownedFiles. The protected file list (`ops/protected-governance-files.json`) does not intersect with owned file paths. However, `scripts/pulse/parsers/hook-registry.ts` is owned by pulse-worker-01; this is inside the PULSE machine surface but not a governance-locked file per se.

### Finding 5: No Cross-Lease Owned File Overlap
The PULSE lease system correctly prevents the same file from appearing in >1 lease's ownedFiles. The collision is in readOnly surfaces: w2-w4 and w10 carry 534-557 readOnly entries that duplicate w1's owned set (96-99% overlap). This is structurally wasteful but not a correctness bug — it means any change to w1's files forces cache invalidation across all other leases that have them as readOnly.

### Finding 6: PULSE_CONTEXT_BROADCAST vs PULSE_WORKER_LEASES
Both files are synchronized: all 10 workers appear in both with identical ownership counts. The broadcast additionally carries validation contracts (runtime evidence, scenario evidence, structural evidence per capability). No drift between the two.

---

## Safe Leases for Next Implementation Wave

These 4 leases have genuine disjoint ownership and no risk-3 files:

| Lease | Worker | Owned | Domain |
|-------|--------|-------|--------|
| lease-a4bfc8f19c26246406 | pulse-worker-02 | 26 files | Checkout (checkout pages, checkout editor, pricing page), Apple auth diagnostic, MercadoPago webhook, CRM/KYC/PostSale emitters, WhatsApp brain, daily-dashboard |
| lease-8e111bf59b67ff3441 | pulse-worker-03 | 4 files | Chat controller/service, admin permission guard, provider-status route |
| (w5 lease) | pulse-worker-05 | 1 file | System health external probes |
| (w10 lease) | pulse-worker-10 | 5 files | CIA page (cognitive section, panels, registries, sections, intelligence route) |

**Recommendation**: Dispatch 3 workers from the above set (w2, w3, w10) on disjoint domains. Avoid w5 (health probe) — it's a single-file diagnostic surface, not a productive implementation target.

---

## Recommended Disjoint Ownership Restructuring

### Phase 1: Break the Monolith
Split pulse-worker-01's 580 files across 5-7 scoped leases:

1. **auth-leases** (~30 files): auth, admin-auth, admin-mfa, rate-limit, oauth, facebook/tiktok/apple/google auth, email auth
2. **payments-treasury-leases** (~18 files): payments (connect, fraud, ledger, split), wallet, marketplace-treasury, billing, plan-limits → **Risk 3, requires evidence contract**
3. **whatsapp-leases** (~25 files): whatsapp (controller, service, session, watchdog, catchup, inbound, message-dispatcher, reconciler), whatsapp-api-webhook
4. **kloel-brain-leases** (~60 files): kloel (controller, service, thinker, composer, thread, tool-executor/dispatcher, unified-agent, brain-runtime/autonomy/event-spine, memory)
5. **admin-domain-leases** (~35 files): admin accounts, audit, chat, users, products, transactions, reports, pipeline, destructive, notifications, permissions, dashboard
6. **frontend-core-leases** (~200 files): frontend and frontend-admin pages, components, hooks, lib/api, routes — split by domain area
7. **integration-emitters-leases** (~30 files): checkout-emitter, campaign-emitter, member-area-emitter, crm-emitter, kyc-emitter, post-sale-emitter, whatsapp-emitter, spine-emitter

### Phase 2: Clean Phantoms
Expire or collapse leases with 0 owned files (w4, w6, w7, w8, w9).

### Phase 3: Reduce readOnly Bloat
readOnly sets should be scoped to the files a worker actually needs to read for its owned work, not the entire monolithic catalog. Currently w2-w4 and w10 carry 96-99% of the entire project as readOnly baggage.

---

## Acceptance Checks for Future Workers

Every dispatched worker must:

1. **Own a disjoint set** — no file in ownedFiles overlaps with any other active lease
2. **Risk classification** — no Risk 3 files (payments, wallet, ledger, billing) without explicit evidence contract
3. **Minimal readOnly** — readOnlyFiles includes only files actually read by the task, not the full project catalog
4. **Handoff persisted** — must write a handoff to `docs/ai/mission/handoffs/` before completion (per DG-004)
5. **acceptanceCriteria in validationContract** — every capability a worker touches must have at least one concrete acceptance criterion resolved

---

## Commands/Tests Run

```sh
# Evidence extraction
node -e "[...] lease topology enumeration" → 10 leases, 616 total owned files (580 in w1)
wc -l PULSE_WORKER_LEASES.json → 5410 lines
wc -l PULSE_CONTEXT_BROADCAST.json → 12333 lines

# Git state
git branch --show-current → feat/kloel-cognitive-organism
git status --short → modified CI/CD/CodeQL/deploy workflows (human work, not touched)

# Atomic locks
ls .atomic-edit-locks/ → 9 active locks (front-*, oc-*)
```

## Evidence Before/After

### Before (Current State)
- 10 leases, 1 monolithic (580 files), 5 phantoms (0 files), 4 small disjoint
- readOnly bloat: 534-557 overlap entries per lease duplicating w1's ownership
- All Risk 3 files in monolithic lease
- No handoffs persisted in `docs/ai/mission/handoffs/` (empty directory)

### After (This Audit)
- Handoff written to `docs/ai/mission/handoffs/OC-SWARM-LEASE-COLLISION-001.md`
- Topology catalogued with quantitative metrics
- 4 safe leases identified for next wave
- Decomposition plan drafted (Phase 1-3)
- Acceptance checks specified for future workers

## Blockers
- **PULSE lease topology is auto-generated** — this audit cannot restructure leases; it can only report and recommend. A PULSE reconfiguration or manual lease override is needed to break the monolith.
- **No active PULSE writer process confirmed** — but `PULSE_WORKER_LEASES.json` was generated 2026-05-16T16:26:24.678Z (~30min TTL), meaning the PULSE generator will regenerate leases soon. Any manual restructuring must account for this.
- **Delegation rules surface** — the subagent delegation rules (`scripts/decomp/opencode-subagent-delegation-rules.md`) are PULSE-auditor-debt focused and do not cover lease topology restructuring. This worker is operating outside its nominal scope.

## Risk Residual
- **Medium**: The PULSE lease generator may overwrite any manual restructuring on next run. Coordination with the PULSE configuration is required.
- **Low**: No protected files, no secrets, no code changes made. This is a pure read audit.
- **Low**: The 4 safe leases identified are genuinely disjoint. They can be dispatched immediately if the PULSE topology is frozen.

## Recommendation for Next Worker
1. `OC-LEASE-RESTRUCTURE-001`: Break pulse-worker-01 into 5-7 scoped leases following the decomposition plan above. Coordinate with PULSE generator to prevent overwrite.
2. `OC-PHANTOM-CLEANUP-001`: Expire leases w4, w6, w7, w8, w9 (zero-owned).
3. `OC-IMPLEMENT-WAVE-001`: Dispatch 3 workers from the safe set (w2 checkout, w3 chat, w10 CIA) with handoff and acceptance contracts.

## Accepted/Rejected Self-Status
**ACCEPTED.** This handoff provides complete evidence for the lease topology audit. All required fields are present. No code was modified. No protected files were touched. The audit is read-only, quantitative, and actionable.

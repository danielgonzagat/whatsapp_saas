# W25-B — `commerce.whatsapp.*` event taxonomy audit

**Date:** 2026-05-26
**Scope:** 3 legacy event names listed in [[DEPRECATION_MAP]] Wave 21 Round 2
**Authored by:** CEO (Claude) directly via codegraph + grep
**Why direct:** Previous PI atomic subagent `w25-whatsapp-events-audit`
exited EXIT 0 without writing the requested report (silent failure pattern
also observed in W24 crash-loop fleet); audit redone in-context.

## Summary table

| Legacy event | Proposed canonical | Emit | Listen | Spec | Registry | Risk | Status |
|---|---|---:|---:|---:|---:|---|---|
| `commerce.whatsapp.session_lifecycle` | `channel.session.lifecycle` (single rename) OR 4 sub-events (split) | 1 | 2 | 7 | 2 | MED (rename) / HIGH (split) | ⏳ planned |
| `commerce.whatsapp.handoff_to_human` | `conversation.assigned` | ≥1 | 44 | 5 | 0 | MED (45 files coordinated) | ⏳ planned |
| `commerce.whatsapp.conversation_resumed` | `conversation.resumed` | 1 | 3 | 2 | 2 | LOW (9 sites total) | ⏳ planned — **lowest-risk first** |

Total touched files: **62** (estimated, after dedup; some files match multiple legacy names).

## Inventory — `commerce.whatsapp.session_lifecycle` (15 sites)

### EMIT (1)
- `backend/src/kloel/whatsapp-emitter/whatsapp-event-emitter.service.ts:194`

### REGISTRY (5 lines across 2 files)
- `backend/src/kloel/channel-policy/channel-policy.registry.ts:26,34,42` (3 entries: list + 2 weights)
- `backend/src/kloel/channel-survival/channel-health.types.ts:22` (POLICY_VIOLATION_EVENTS Set member)

### LISTEN / FILTER (2)
- `backend/src/kloel/spine/spine-coverage-auditor.service.ts:85`
- `backend/src/kloel/tipo-negocio/tipo-negocio.classifier.service.ts:49`

### SPEC (7)
- `backend/src/kloel/channel-survival/channel-health.monitor.service.spec.ts:189,196,246,247,248,260`
- `backend/src/kloel/channel-policy/channel-policy.registry.spec.ts:19`
- `backend/src/kloel/whatsapp-emitter/whatsapp-event-emitter.service.spec.ts:178`

### Sub-event consideration
The emitter sends the SINGLE name `commerce.whatsapp.session_lifecycle` with
payload sub-kind (`qr`, `connected`, `disconnected`, `banned`). Splitting to
`channel.session.{qr_generated,connected,disconnected,banned}` is **NOT** a
pure string rename — it changes the EVENT SHAPE and requires:
1. Emit code branches on sub-kind, emits the right event name
2. Registry expands from 1 entry → 4 entries each weighted independently
3. Listener filters expand similarly
4. Spec fixtures restructured

Recommendation: **defer split to a future ADR**; do a flat string rename now
to `channel.session.lifecycle` (single canonical name aligned with the
[[CANONICAL_VOCABULARY]] `channel.*` namespace).

## Inventory — `commerce.whatsapp.handoff_to_human` (45 files, heaviest)

### Top emit/listen file groups (representative — full list omitted for brevity)

| File group | Role | Count |
|---|---|---:|
| `kloel/owner-criterion/observers/*.ts` (5 files: tone, decision, risk-tolerance, ethical-line, approval-threshold) | Listener (`if e.eventName === 'commerce.whatsapp.handoff_to_human'`) | 5 |
| `kloel/goal-field/detectors/*.ts` | Listener | 4+ |
| `kloel/healthy-money/*.ts` (refund-risk, brand-wear, support-cost, revenue-quality, healthy-money) | Listener / Aggregation | 5+ |
| `kloel/recovery/*.ts` | Listener | 3+ |
| `kloel/team/*.ts` (blind-spot-illuminator, forgotten-followup.rescuer) | Listener | 2 |
| `kloel/maturity/*.ts` | Listener | 1+ |
| `kloel/drift/*.ts` | Listener | 2 |
| `kloel/daily-dashboard/*.ts` | Listener | 2 |
| `kloel/insight/insight.types.ts` | Constant | 1 |
| `kloel/spine/spine-coverage-auditor.service.ts` | Mapping | 1 |
| `*.spec.ts` (healthy-money, recovery, daily-dashboard-contract, goal-field, cog345) | Spec fixtures | 5+ |

### Migration plan (LOW-MED risk, ~45 files atomic_transaction)

The migration is a pure string-literal replacement; no shape change.

```python
# Conceptual codemod (CEO recommendation):
sed -i '' "s/'commerce\.whatsapp\.handoff_to_human'/'conversation.assigned'/g" \
  $(git ls-files 'backend/src/kloel/**/*.ts' | xargs grep -l 'commerce\.whatsapp\.handoff_to_human')
```

Better to wrap in an `atomic_transaction` (per `mcp__atomic-edit__atomic_transaction`)
that validates each file's syntax after edit and rolls back any partial failures.

**Pre-migration check**: confirm no broader pattern matches (e.g. `handoff_to_human`
as a substring of an unrelated identifier). Grep shows only the quoted string usage.

## Inventory — `commerce.whatsapp.conversation_resumed` (9 sites, lowest risk)

### EMIT (1)
- `backend/src/kloel/whatsapp-emitter/whatsapp-event-emitter.service.ts:175`

### REGISTRY (4 lines across 1 file)
- `backend/src/kloel/channel-policy/channel-policy.registry.ts:29,37,45`

### LISTEN (3)
- `backend/src/kloel/insight/insight.types.ts:107`
- `backend/src/kloel/team/pre-call-context.builder.ts:32`
- `backend/src/kloel/spine/spine-coverage-auditor.service.ts:84`

### SPEC (2)
- `backend/src/kloel/channel-policy/channel-policy.registry.spec.ts:22`
- `backend/src/kloel/whatsapp-emitter/whatsapp-event-emitter.service.spec.ts:134`

### Migration plan (LOW risk, 9 sites)

```python
# Codemod:
sed -i '' "s/'commerce\.whatsapp\.conversation_resumed'/'conversation.resumed'/g" \
  $(git ls-files 'backend/src/kloel/**/*.ts' | xargs grep -l 'commerce\.whatsapp\.conversation_resumed')
```

**Pre-migration check**: confirm `spine-coverage-auditor.service.ts:84` (already
maps legacy → short name) handles the new canonical correctly — this is the
"taxonomy bridge" that may need a deprecation alias instead of rename.

## Concrete `atomic_transaction` plan — `conversation_resumed` (recommended first wave)

```jsonc
// Pseudocode for mcp__atomic-edit__atomic_transaction
{
  "plan": [
    { "file": "backend/src/kloel/whatsapp-emitter/whatsapp-event-emitter.service.ts",
      "edits": [{ "find": "'commerce.whatsapp.conversation_resumed'", "replace": "'conversation.resumed'" }] },
    { "file": "backend/src/kloel/channel-policy/channel-policy.registry.ts",
      "edits": [/* 3 occurrences */] },
    // ... 7 more files
  ],
  "preview": true   // dry-run first
}
```

After dry-run validates all files compile, flip `preview: false` and execute.

## Risk classification

- **HIGH** if rename breaks the channel-policy registry semantics — needs careful spec re-validation
- **LOW** for pure string consolidation in detector/listener bodies
- **NONE** for spec fixtures

## Next-wave recommendations (priority order)

1. **conversation_resumed → conversation.resumed** (9 sites, lowest risk, can run first)
2. **session_lifecycle FLAT rename to channel.session.lifecycle** (defer split; 15 sites; MED risk due to POLICY_VIOLATION_EVENTS aggregator)
3. **handoff_to_human → conversation.assigned** (45 files; MED risk due to volume; requires single atomic transaction or coordinated PR with full spec re-run)

## Verification commands

```bash
# Pre-migration baseline:
git grep -c "'commerce\.whatsapp\." backend/src/kloel | sort -t: -k2 -nr | head

# Post-migration verification per event:
git grep -l "'commerce\.whatsapp\.conversation_resumed'" backend/src/   # expect 0
git grep -l "'conversation\.resumed'" backend/src/                        # expect ≥ pre-migration emit/listen count
```

## Related

- [[CANONICAL_VOCABULARY]] — `channel.*` and `conversation.*` namespaces
- [[EVENT_TAXONOMY]] — canonical event registry
- [[DEPRECATION_MAP]] — Wave 21 Round 2 planned rows for these 3 events

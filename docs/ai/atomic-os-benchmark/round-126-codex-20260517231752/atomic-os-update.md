# Atomic OS Update Need From Round 126

## What Improved

The runtime-owner class policy worked:

- source count improved;
- inventory improved;
- largest module improved;
- churn improved;
- net source delta improved;
- first durable write remained ahead.

## Remaining Loss

Facade compactness is still worse:

```txt
Normal facade: 148 lines
Atomic facade: 174 lines
```

The observed cause is `processIncomingMessage`: Atomic preserved the full wrapper body in the facade, while Normal delegated it into the message runtime owner.

## Required Direction

Update Atomic OS so retained public leaf wrappers are not only kept or fully released into function modules. In `runtime_owner_class_delegation`, the system should compile a third topology:

```txt
preserve public method signature in facade
delegate body to owner runtime method
move wrapper body into the owner runtime
```

This should activate when:

- runtime-owner class mode is already preferred;
- the retained wrapper calls a method owned by that runtime;
- product source count does not increase;
- validation/scorecard remain green.

This remains dynamic: no fixed line budget, no hardcoded method name, no hardcoded file name.

## Change Applied

Implemented `retained_public_leaf_runtime_owner_delegation_policy` in the Atomic refactor fast-path.

The replay on the main workspace now classifies `processIncomingMessage` as a selected write target for `backend/src/kloel/unified-agent-process.ts` when runtime-owner class delegation is already the measured preferred shape. The retained public leaf release gate passes through `runtimeOwnerDelegationPass=true`, while the standard count-based release gate remains false.

## Validation

```txt
node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs
pass

git diff --check -- docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs docs/ai/atomic-os-benchmark/round-126-codex-20260517231752
pass

atomic-operational-hardcode-inventory over docs/ai/atomic-os-benchmark/tools
pass: operational_hardcode_count=0
```

Replay evidence:

```txt
delegationShape=runtime_owner_class_delegation
runtimeOwnerClassEconomy.pass=true
processIncoming.ownerKind=selected_write_target
processIncoming.publicLeafReleaseEconomy.runtimeOwnerDelegationPass=true
```

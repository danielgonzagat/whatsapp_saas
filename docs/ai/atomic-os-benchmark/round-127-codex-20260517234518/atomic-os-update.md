# Atomic OS Update From Round 127

## Problem

Atomic over-optimized for facade compactness.

It reached a 148-line facade, but the price was high:

```txt
Atomic changed inventory: 881
Normal changed inventory: 821

Atomic churn: 1398
Normal churn: 570

Atomic net source delta: +144
Normal net source delta: +84
```

The pattern was not a functional failure. Both workers passed focused Jest and public API preservation. The loss was operational economy.

## Root Cause

The previous fast-path treated runtime-owner class delegation as permission to move the dominant public orchestration root into a new owner module.

That is sometimes correct, but in this topology the dominant root is large and the cheaper move is to keep the root in the facade while extracting only private helper/support surface and sibling roots.

## Change

Added a dynamic macro shape:

```txt
dominant_public_root_retention
```

This shape is generated when the compiler detects:

```txt
public dominant root
private/helper surface attached to that root
other extractable dependency roots
measured facade/churn/inventory tradeoff better than moving the root body
```

The shape emits:

```txt
retained dominant public root
helper/support write target
sibling runtime write targets
local compaction for retained wrapper leaves
releaseEligible=false for the retained dominant root
```

## Validation

```txt
node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs
pass

git diff --check -- docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs
pass

atomic-operational-hardcode-inventory over docs/ai/atomic-os-benchmark/tools
pass: operational_hardcode_count=0
```

Replay:

```txt
preferredShape=dominant_public_root_retention
dominantRoot=processMessage
candidateComparison.dominantRetentionVsSplitLargestDelta=-8
candidateComparison.dominantRetentionVsSplitInventoryDelta=0
retainInFacade=processIncomingMessage,buildQuotedReplyPlan,processMessage
firstWriteTarget=backend/src/kloel/unified-agent-execute.ts
```

## Expected Effect

The next round should reduce Atomic inventory/churn/net delta while preserving enough facade compactness to beat Normal. If Atomic still loses economy, the next update should focus on trace batching and single-write facade replacement rather than more extraction.

# Round 046 Invalidated

Status: invalidated, not benchmark evidence.

Reason: the round event files were contaminated by concurrent runners. Two stale
`codex exec` processes from an earlier launch and two intended OpenCode workers
were writing into the same `round-046/*events.jsonl` artifacts at the same time.

Operational decision: abort the round, terminate all `round-046` worker
processes, and restart the same benchmark tier in a clean round with OpenCode
only and exclusive event files.

Evidence:

- stale Codex runners used `/private/tmp/kloel-ab046-*-20260516233358`
- intended OpenCode runners used `/private/tmp/kloel-ab046-*-20260516233536`
- both families targeted `docs/ai/atomic-os-benchmark/round-046/*events.jsonl`

Benchmark policy: no result from this round can be used to claim normal or
atomic superiority.

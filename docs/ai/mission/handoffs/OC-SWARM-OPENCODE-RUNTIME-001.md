# Handoff: OC-SWARM-OPENCODE-RUNTIME-001

- **Worker ID**: OC-SWARM-OPENCODE-RUNTIME-001
- **Status**: accepted
- **Timestamp**: 2026-05-16 13:31 America/Sao_Paulo

## Objective Received

Audit local OpenCode runtime readiness for a supervised worker pool. Verify installed version, available model `deepseek/deepseek-v4-pro`, current server/process state, memory pressure, and safe practical worker pool size. Do not launch additional workers. Do not alter credentials or configs.

## Files Read

- `scripts/decomp/opencode-subagent-delegation-rules.md` — delegation rules, prohibitions, scope rules
- `docs/ai/mission/MISSION_STATE_LEDGER.md` — mission state and ledger
- `docs/ai/mission/SUBAGENT_HANDOFFS.md` — prior handoffs and handoff protocol

## Files Changed

None.

## Hypothesis

OpenCode 1.14.48 is installed with deepseek/deepseek-v4-pro available and DeepSeek API credentials configured. The system (16 GB RAM, Apple Silicon, 10 cores) may be under memory pressure from existing processes, limiting safe additional worker launch.

## Decision

OpenCode runtime is **critical** — cannot safely add workers. Memory is the bottleneck, not compute. Current 5 `.opencode` processes already stress the 16 GB host with swap at 91%.

## Commands/Tests Run

| Command | Result |
|---|---|
| `opencode --version` | 1.14.48 |
| `opencode models` | deepseek/deepseek-v4-pro listed (among 9 models) |
| `opencode providers list` | DeepSeek API credentials configured |
| `opencode mcp list` | atomic-edit connected (1 server) |
| `opencode session list` | 25+ sessions; 1,932 total over 10 days |
| `opencode stats` | 1,932 sessions, $925.35 cost, 190.4M input / 15.8M output tokens |
| `ps` process scan | 5 `.opencode` processes, 290-400 MB RSS each |
| `vm_stat` | page size 16384, free pages ~34,468 (~539 MB) |
| `sysctl vm.swapusage` | 10 GB swap, 9.3 GB used (91%), 917 MB free |
| `sysctl hw.memsize hw.ncpu` | 16 GB RAM, 10 cores |
| `memory_pressure` | 16 GB total, free pages 46,907 at snapshot |

## Evidence Before/After

**Before (assumption)**: OpenCode runtime ready for pool expansion.

**After (measured reality)**:
- OpenCode 1.14.48: ready (version current, model available, MCP connected)
- Model `deepseek/deepseek-v4-pro`: available and listed
- Provider DeepSeek: configured with API credentials
- Process state: 5 `.opencode` workers active; Codex processes also running
- Memory: 16 GB RAM, 91% swap used, ~540 MB free pages, compressor active
- History: 1,932 sessions across 10 days, $925.35 total cost
- Memory aggregate: ~26.6 GB opencode-ai RSS (shared), ~30.9 GB node RSS (shared)

**Pool readiness verdict**: NOT READY for additional workers on this host.

## Blockers

1. **Memory exhaustion** — 91% swap used, only ~540 MB free physical pages. Each additional `.opencode` worker = ~300-400 MB RSS. System is near OOM-kill territory.
2. **Multiple CLI stacks** — Codex and OpenCode both running, sharing the same 16 GB host. Combined opencode-ai + codex + node processes aggregate well beyond physical RAM.
3. **Swap I/O thrash risk** — 119M swapins, 139M swapouts indicate active paging. Adding workers will degrade all processes.

## Risk Residual

- OpenCode itself is functional (version, model, MCP, provider all green). The risk is purely infra/resource.
- If the orchestrator proceeds to launch workers anyway, expect OOM kills, session corruption, or swap-thrash degrading all concurrent workers.
- `opencode stats` shows `edit` tool used 9,290 times across sessions — suggests the native `Edit` may be competing with atomic-edit. The atomic-only hook is loaded but enforcement history is uncertain.

## Recommendation for Next Worker

1. **Do NOT launch additional OpenCode workers on this host** until swap is below 50% or physical RAM is freed (e.g., stop unused processes, close Chrome/Codex).
2. **Offload worker pool to a separate machine** with >= 32 GB RAM for 20-50 worker target.
3. **Immediate safe step**: run `killall -STOP` on idle `.opencode` workers, reclaim ~1.5 GB, then launch at most 1 additional worker if the orchestrator needs it.
4. **Audit recommendation**: `OC-SWARM-RESOURCE-RECLAIM-001` — identify and safely stop stale OpenCode/Codex/node processes before attempting pool expansion.
5. **Long-term**: move the worker pool to a dedicated host (Railway worker, cloud VM, or separate Mac mini with >= 32 GB) and keep this 16 GB host for orchestration only.

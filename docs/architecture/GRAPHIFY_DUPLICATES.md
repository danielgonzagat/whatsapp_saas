# Kloel Graphify-Driven Duplicate Register

> Symbol-level duplicate index built from graphify's enriched graph
> (`graphify-out/enriched-graph.json`). Catches non-exported duplicates
> the regex-based scanner in `scan.mjs` misses.

Generated from 92123 nodes / 192894 edges.

Total duplicate-label groups: **1566**.

**Status legend:**
- ✅ `canonicalized` — already consolidated; see DEPRECATION_MAP.md
- ⏳ `pending` — duplicate detected, not yet consolidated

## Top 50 dedup candidates (sorted by # files, then total callers)

| Symbol | Kind | # files | Total callers | Status |
|---|---|---:|---:|---|
| `Mission` | type | 103 | 0 | ⏳ pending |
| `Decision` | type | 90 | 0 | ⏳ pending |
| `main` | function | 87 | 0 | ⏳ pending |
| `Task` | type | 84 | 0 | ⏳ pending |
| `Validation` | type | 80 | 0 | ⏳ pending |
| `Result` | type | 73 | 0 | ⏳ pending |
| `timestamp_ms` | function | 58 | 0 | ⏳ pending |
| `Evidence` | type | 57 | 0 | ⏳ pending |
| `Diagnosis` | type | 52 | 0 | ⏳ pending |
| `REPO_ROOT` | type | 46 | 0 | ⏳ pending |
| `POST` | function | 41 | 0 | ⏳ pending |
| `Scorecard` | type | 41 | 0 | ⏳ pending |
| `Summary` | type | 39 | 0 | ⏳ pending |
| `Objective` | type | 39 | 0 | ⏳ pending |
| `clamp` | function | 34 | 0 | ✅ done |
| `Recommendation` | type | 32 | 0 | ⏳ pending |
| `Contents` | type | 31 | 0 | ⏳ pending |
| `Constraints` | type | 31 | 0 | ⏳ pending |
| `makeEvent` | function | 30 | 0 | ⏳ pending |
| `buildService` | function | 29 | 0 | ⏳ pending |
| `UnknownRecord` | type | 28 | 0 | ⏳ pending |
| `Verdict` | type | 28 | 0 | ⏳ pending |
| `MockPrisma` | type | 27 | 0 | ⏳ pending |
| `unique` | function | 27 | 0 | ⏳ pending |
| `Gates` | type | 27 | 0 | ⏳ pending |
| `PrismaMock` | type | 24 | 0 | ⏳ pending |
| `Status` | type | 23 | 0 | ⏳ pending |
| `FlexMock` | type | 22 | 0 | ⏳ pending |
| `Setup` | type | 22 | 0 | ⏳ pending |
| `readText` | function | 21 | 0 | ⏳ pending |
| `Method` | type | 21 | 0 | ⏳ pending |
| `isRecord` | function | 20 | 0 | ⏳ pending |
| `Wins` | type | 20 | 0 | ⏳ pending |
| `Conclusion` | type | 19 | 0 | ⏳ pending |
| `Props` | type | 18 | 0 | ⏳ pending |
| `readString` | function | 17 | 0 | ⏳ pending |
| `baseInput` | function | 17 | 0 | ⏳ pending |
| `makeSpine` | function | 17 | 0 | ⏳ pending |
| `build` | function | 16 | 0 | ⏳ pending |
| `MISSAO` | type | 16 | 0 | ⏳ pending |
| `VAULT_ROOT` | type | 15 | 0 | ⏳ pending |
| `ATOMIC_OS_REPO_ROOT` | type | 15 | 0 | ⏳ pending |
| `read_json` | function | 15 | 0 | ⏳ pending |
| `call_atomic` | function | 15 | 0 | ⏳ pending |
| `safeStr` | function | 14 | 0 | ✅ done |
| `REPO` | type | 13 | 0 | ⏳ pending |
| `TABS` | type | 12 | 0 | ⏳ pending |
| `ROOT` | type | 12 | 0 | ⏳ pending |
| `asRecord` | function | 12 | 0 | ⏳ pending |
| `constructor` | function | 12 | 0 | ⏳ pending |

## How to use this register

1. Pick the top `⏳ pending` row
2. Verify semantic equivalence: read the 2+ implementations
3. Pick canonical home (most foundational module wins)
4. Use `atomic_replace_text` to install re-export pattern in the others
5. Run `npm run canonical:scan && npm run canonical:check`
6. Commit, push, regenerate this register

## Regenerate

```sh
node tools/canonicalize/graphify-driven-dedup.mjs
```

Pre-requisite: `npm run graph:extract` (refreshes `graphify-out/enriched-graph.json`).

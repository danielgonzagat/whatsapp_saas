# Kloel Graphify-Driven Duplicate Register

> Symbol-level duplicate index built from graphify's enriched graph
> (`graphify-out/enriched-graph.json`). Catches non-exported duplicates
> the regex-based scanner in `scan.mjs` misses.

Generated from 63764 nodes / 78170 edges.

Total duplicate-label groups: **1028**.

**Status legend:**
- ✅ `canonicalized` — already consolidated; see DEPRECATION_MAP.md
- ⏳ `pending` — duplicate detected, not yet consolidated

## Top 50 cross-context dedup candidates

> Only includes symbols whose label appears in **>=2 distinct bounded contexts**
> (e.g., `Task` defined in both `backend/src/kloel/mind` and `backend/src/auth`).
> Same-name duplicates contained within a single bounded context are filtered
> as intentionally domain-local.

| Symbol | Kind | # files | # contexts | Total callers | Status |
|---|---|---:|---:|---:|---|
| `PATTERN_RE` | type | 50 | 26 | 0 | ⏳ pending |
| `POST` | type | 48 | 3 | 0 | ⏳ pending |
| `D_RE` | type | 38 | 17 | 0 | ⏳ pending |
| `makeEvent` | symbol | 29 | 8 | 0 | ⏳ pending |
| `dynamic` | symbol | 28 | 3 | 0 | ⏳ pending |
| `MockPrisma` | type | 27 | 7 | 0 | ⏳ pending |
| `clamp` | symbol | 27 | 15 | 0 | ✅ done |
| `unique` | symbol | 27 | 12 | 0 | ⏳ pending |
| `PrismaMock` | type | 26 | 7 | 0 | ⏳ pending |
| `EMBER` | type | 24 | 4 | 0 | ⏳ pending |
| `S_RE` | type | 22 | 13 | 0 | ⏳ pending |
| `isRecord` | symbol | 21 | 16 | 0 | ⏳ pending |
| `FlexMock` | type | 20 | 8 | 0 | ⏳ pending |
| `buildService` | symbol | 20 | 10 | 0 | ⏳ pending |
| `SORA` | type | 20 | 3 | 0 | ⏳ pending |
| `Props` | type | 18 | 3 | 0 | ⏳ pending |
| `readString` | symbol | 17 | 12 | 0 | ⏳ pending |
| `makeSpine` | symbol | 17 | 6 | 0 | ⏳ pending |
| `baseInput` | symbol | 17 | 6 | 0 | ⏳ pending |
| `BORDER` | type | 17 | 3 | 0 | ⏳ pending |
| `providerRegistry` | symbol | 16 | 2 | 0 | ⏳ pending |
| `inputStyle` | symbol | 16 | 5 | 0 | ⏳ pending |
| `mockAutopilotAdd` | symbol | 15 | 2 | 0 | ⏳ pending |
| `whatsappApi` | symbol | 15 | 2 | 0 | ⏳ pending |
| `TEXT` | type | 14 | 2 | 0 | ⏳ pending |
| `PROCESSOR_VERSION` | type | 13 | 8 | 0 | ⏳ pending |
| `SCHEMA_VERSION` | type | 13 | 8 | 0 | ⏳ pending |
| `PATTERN_RE_2` | type | 13 | 8 | 0 | ⏳ pending |
| `MONO` | type | 13 | 3 | 0 | ⏳ pending |
| `asRecord` | symbol | 12 | 10 | 0 | ⏳ pending |
| `TABS` | type | 12 | 3 | 0 | ⏳ pending |
| `FONT_MONO` | type | 12 | 4 | 0 | ⏳ pending |
| `sora` | symbol | 12 | 5 | 0 | ⏳ pending |
| `safeStr` | symbol | 11 | 4 | 0 | ✅ done |
| `WHITESPACE_G_RE` | type | 11 | 6 | 0 | ⏳ pending |
| `mockPrisma` | symbol | 10 | 3 | 0 | ⏳ pending |
| `A_Z0_9_RE` | type | 10 | 6 | 0 | ⏳ pending |
| `U0300__U036F_RE` | type | 10 | 7 | 0 | ⏳ pending |
| `readRecord` | symbol | 10 | 7 | 0 | ⏳ pending |
| `StatCard` | type | 10 | 3 | 0 | ⏳ pending |
| `labelStyle` | symbol | 10 | 4 | 0 | ⏳ pending |
| `resolveWorkspaceIdMock` | symbol | 9 | 9 | 0 | ⏳ pending |
| `REDIS_TOKEN` | type | 9 | 6 | 0 | ⏳ pending |
| `asString` | symbol | 9 | 9 | 0 | ⏳ pending |
| `sha256` | symbol | 9 | 5 | 0 | ⏳ pending |
| `PROCESSOR_NAME` | type | 9 | 4 | 0 | ⏳ pending |
| `formatCurrency` | symbol | 9 | 4 | 0 | ✅ done |
| `SURFACE` | type | 9 | 2 | 0 | ⏳ pending |
| `WHITESPACE_RE` | type | 8 | 7 | 0 | ⏳ pending |
| `NON_DIGIT_RE` | type | 8 | 3 | 0 | ⏳ pending |

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

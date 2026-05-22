# Kloel Graphify-Driven Duplicate Register

> Symbol-level duplicate index built from graphify's enriched graph
> (`graphify-out/enriched-graph.json`). Catches non-exported duplicates
> the regex-based scanner in `scan.mjs` misses.

Generated from 92003 nodes / 191074 edges.

Total duplicate-label groups: **847**.

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
| `main` | function | 79 | 27 | 0 | ⏳ pending |
| `REPO_ROOT` | type | 46 | 14 | 0 | ⏳ pending |
| `clamp` | function | 34 | 21 | 0 | ✅ done |
| `makeEvent` | function | 30 | 9 | 0 | ⏳ pending |
| `buildService` | function | 29 | 12 | 0 | ⏳ pending |
| `UnknownRecord` | type | 28 | 4 | 0 | ⏳ pending |
| `MockPrisma` | type | 27 | 7 | 0 | ⏳ pending |
| `unique` | function | 27 | 12 | 0 | ⏳ pending |
| `PrismaMock` | type | 24 | 6 | 0 | ⏳ pending |
| `FlexMock` | type | 22 | 8 | 0 | ⏳ pending |
| `readText` | function | 21 | 5 | 0 | ⏳ pending |
| `isRecord` | function | 20 | 16 | 0 | ⏳ pending |
| `Props` | type | 18 | 3 | 0 | ⏳ pending |
| `readString` | function | 17 | 12 | 0 | ⏳ pending |
| `baseInput` | function | 17 | 6 | 0 | ⏳ pending |
| `makeSpine` | function | 17 | 6 | 0 | ⏳ pending |
| `build` | function | 16 | 11 | 0 | ⏳ pending |
| `VAULT_ROOT` | type | 15 | 4 | 0 | ⏳ pending |
| `safeStr` | function | 14 | 4 | 0 | ✅ done |
| `ROOT` | type | 13 | 11 | 0 | ⏳ pending |
| `REPO` | type | 13 | 2 | 0 | ⏳ pending |
| `TABS` | type | 12 | 3 | 0 | ⏳ pending |
| `asRecord` | function | 12 | 10 | 0 | ⏳ pending |
| `constructor` | function | 12 | 2 | 0 | ⏳ pending |
| `sha256` | function | 12 | 8 | 0 | ⏳ pending |
| `fail` | function | 12 | 6 | 0 | ⏳ pending |
| `input` | function | 11 | 6 | 0 | ⏳ pending |
| `readRecord` | function | 10 | 7 | 0 | ⏳ pending |
| `formatCurrency` | function | 10 | 3 | 0 | ✅ done |
| `StatCard` | function | 10 | 3 | 0 | ⏳ pending |
| `sleep` | function | 10 | 7 | 0 | ⏳ pending |
| `buildController` | function | 10 | 10 | 0 | ⏳ pending |
| `MIRROR_ROOT` | type | 10 | 4 | 0 | ⏳ pending |
| `parseArgs` | function | 10 | 4 | 0 | ⏳ pending |
| `asString` | function | 9 | 9 | 0 | ⏳ pending |
| `canActivate` | function | 9 | 8 | 0 | ⏳ pending |
| `SOURCE_MIRROR_DIR` | type | 9 | 4 | 0 | ⏳ pending |
| `normalizePath` | function | 9 | 6 | 0 | ⏳ pending |
| `errorMessage` | function | 8 | 5 | 0 | ⏳ pending |
| `ConceptRow` | type | 8 | 2 | 0 | ⏳ pending |
| `uniqueStrings` | function | 8 | 6 | 0 | ⏳ pending |
| `isObject` | function | 8 | 2 | 0 | ⏳ pending |
| `check` | function | 8 | 3 | 0 | ⏳ pending |
| `formatDate` | function | 7 | 4 | 0 | ⏳ pending |
| `formatDateTime` | function | 7 | 3 | 0 | ⏳ pending |
| `formatInteger` | function | 7 | 3 | 0 | ⏳ pending |
| `ChatMessage` | type | 7 | 2 | 0 | ⏳ pending |
| `createService` | function | 7 | 3 | 0 | ⏳ pending |
| `makePrisma` | function | 7 | 5 | 0 | ⏳ pending |
| `makePrismaStub` | function | 7 | 5 | 0 | ⏳ pending |

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

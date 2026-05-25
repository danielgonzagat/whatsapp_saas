# Pattern Migration Playbook (canonicalization at scale)

> How to safely consolidate the ~1000 cross-context duplicates indexed in
> [GRAPHIFY_DUPLICATES.md](GRAPHIFY_DUPLICATES.md) without breaking production.
>
> **Generated 2026-05-21** after Round 10 of canonicalization work showed
> that naive batch migration breaks semantics. This playbook codifies the
> per-pattern decision tree learned in the field.

## The core finding

Symbol-name collision **≠** semantic equivalence.

Example: `readString` exists in 9 files across the backend, with **5 distinct
semantics**:

| Variant | Signature | Trim? | Empty? | Fallback? |
|---|---|---|---|---|
| A | `(v) → string \| undefined` | no | undefined | undefined |
| B | `(v) → string \| undefined` | yes | undefined | undefined |
| C | `(v, fallback='') → string` | yes | fallback | param |
| D | `(v, fallback='') → string` | no | fallback | param |
| E | `(v) → string` | yes | '' | hardcoded '' |

Force-unifying A-E to a single function breaks callers that rely on the
specific semantics of their variant (e.g., variant A passes strings
straight through; variant B trims). The fix is **NOT a single helper** — it's
**a small family** of well-named helpers.

## The 4 migration shapes (decision tree)

### Shape 1 — **byte-identical body** (safe single-helper consolidation)

**Example**: `asRecord` had 5 byte-identical declarations (Round 10).
**Action**: extract to `backend/src/common/types.ts:asRecord`, migrate callers via codemod.
**Tooling**: `tools/canonicalize/migrate-as-record.mjs` template.
**Risk**: minimal — behaviorally identical pre/post.

**Detection**: run `grep -hrE "^function NAME" --include="*.ts" backend/src` and
compare bodies. If all 5+ lines match exactly, this shape applies.

### Shape 2 — **same-purpose semantic family** (multi-helper consolidation)

**Example**: `readString` family with 5 variants.
**Action**: extract a family of helpers to `common/parse.ts`:
- `readString(v)` → `string | undefined` (no trim)
- `readTrimmedString(v)` → `string | undefined` (with trim)
- `readStringOr(v, fallback)` → `string` (no trim, with fallback)
- `readTrimmedStringOr(v, fallback)` → `string` (with trim, with fallback)
- `readStringForce(v)` → `string` (trim, fallback '')

Migrate each variant to the matching canonical helper. ~30 min per file.
**Risk**: medium — must verify each caller's actual usage assumption.

**Detection**: same as Shape 1, but bodies differ in small ways (trim, fallback,
empty handling).

### Shape 3 — **domain-specialized predicate** (NOT a dup, leave alone)

**Example**: `isRecord(v): v is IdempotencyRecord` vs `is AuditRequestRecord` vs `is RequestRecord`.

Each is a type guard for a domain-specific narrowing. Force-merging breaks
TypeScript inference downstream (the canonical version returns
`v is UnknownRecord` which loses the domain type info).

**Action**: KEEP separate. Document in this playbook so future scans skip them.

**Detection**: search for `function NAME(v): v is X` where X differs per file.

### Shape 4 — **test helper with state** (factory pattern required)

**Example**: `makeEvent` in 29 spec files, each carrying a module-local
`let seq = 0` counter.

A naive shared helper would make the counter process-global, breaking test
isolation across parallel Jest workers.

**Action**: extract a factory:

```ts
// backend/test/helpers/spine-event-factory.ts
export function makeEventFactory() {
  let seq = 0;
  return function makeEvent(eventName, workspaceId, occurredAtMs, overrides = {}) {
    seq++;
    return { ... };
  };
}
```

Each spec file replaces `let seq = 0; function makeEvent(...) {...}` with
`const makeEvent = makeEventFactory();`.

**Risk**: medium — must verify no spec relies on global ordering across files.

**Detection**: helper closes over a module-local mutable variable.

## Pattern inventory (current state, top 20)

From `node tools/canonicalize/graphify-driven-dedup.mjs` (1028 candidates).
Grouped by migration shape:

### Shape 1 — byte-identical (HIGH leverage, LOW risk)

| Symbol | Files | Status | Action |
|---|---:|---|---|
| `asRecord` | 5 of 8 | ✅ done | Round 10 |
| `UnknownRecord` (type) | 30 | ✅ done | Round 5.2 |
| `PATTERN_RE` (likely) | 50 | ⏳ verify all bodies | If identical → consolidate; if regex differs per file → Shape 3 |

### Shape 2 — same-purpose family (MEDIUM leverage, MEDIUM risk)

| Symbol family | Files | Action |
|---|---:|---|
| `readString` family | 9 | Extract 5-helper family to `common/parse.ts` |
| `readNumber` family | 3+ | Extract 2-helper family (`readNumber`, `readNumberOr`) |
| `readBoolean` | ? | Audit + extract |
| `readDate` | ? | Audit + extract |
| `asNonEmptyString` family | ~10 | Extract `asNonEmptyString(v, field)` to `common/parse.ts` |

### Shape 3 — domain-specialized (KEEP separate, document)

| Symbol | Files | Why | Action |
|---|---:|---|---|
| `isRecord` (with domain `is X`) | 7 | Type guard returns domain-specific predicate | Leave; document in this playbook |
| `getStatus` | 30 | Different per service (`PaymentStatus`, `KycStatus`, etc.) | Leave |
| `getState` | ~20 | Same reason | Leave |

### Shape 4 — test helpers with state (factory pattern)

| Symbol | Files | Closure state | Action |
|---|---:|---|---|
| `makeEvent` | 29 | `let seq = 0` | Extract `makeEventFactory()` to `backend/test/helpers/` |
| `MockPrisma` / `PrismaMock` | 53 | Various mock builders | Extract single `createPrismaMock()` factory |
| `FlexMock` | 22 | Similar | Audit + consolidate |
| `buildService` | 29 | Service builders for tests | Per-service-type factory |
| `baseInput` | 17 | Input fixtures | Per-domain `*Fixture()` factories |
| `makeSpine` | 17 | Spine-event fixtures | Use `makeEventFactory` |

## Per-week migration budget

Realistic: **5-10 migrations per dedicated session**.

Total backlog ÷ velocity: 1028 ÷ 7 = ~150 sessions. Most sessions can do
3-5 migrations on the side of feature work.

**Priority order** for next 10 sessions:
1. Shape 1 remaining: `PATTERN_RE`, `EMBER`, `unique`, `D_RE`, `S_RE`
2. Shape 2: `readString` family → `common/parse.ts`
3. Shape 2: `readNumber` family → `common/parse.ts`
4. Shape 4: `makeEventFactory` extraction → migrate 5 files at a time
5. Shape 4: `createPrismaMock` factory → migrate 10 files at a time

## Anti-patterns to avoid

❌ **Don't batch-rename without semantic review**. Even if 30 files have
the same name, their bodies may differ in critical ways.

❌ **Don't force-unify type guards**. `value is FooRecord` and `value is BarRecord`
are DIFFERENT functions even if their runtime bodies match. Consolidating
loses the type narrow.

❌ **Don't share closure state across test files**. Each `.spec.ts` should
have its own counter / mock state. Use factories that return fresh state.

❌ **Don't migrate without running tsc + tests**. Even byte-identical bodies
can break callers via subtle issues (unused imports, conflicting types,
implicit `any` propagation).

❌ **Don't migrate inside protected paths** (`scripts/pulse/*`, `ops/*`,
`.husky/*`). Those are governance code that the agent cannot touch.

## Detection workflow

```sh
# 1. Refresh symbol-level index
npm run graph:extract

# 2. Get the latest dedup candidate list (Shape 1+2+3+4 mixed)
node tools/canonicalize/graphify-driven-dedup.mjs

# 3. Pick a candidate, check semantics
grep -hrE "^function CANDIDATE_NAME" --include="*.ts" backend/src

# 4. Classify into Shape 1/2/3/4 using the decision tree above

# 5. Author or extend a codemod under tools/canonicalize/migrate-NAME.mjs

# 6. Run codemod + tsc + tests

# 7. Update DEPRECATION_MAP.md + GRAPHIFY_DUPLICATES.md status

# 8. Commit + push (pre-push gate validates no regression)
```

## Tooling references

| Tool | Purpose | Path |
|---|---|---|
| `tools/canonicalize/scan.mjs` | Regex-based inventory | scan |
| `tools/canonicalize/graphify-driven-dedup.mjs` | Symbol-level dedup detector | scan |
| `tools/canonicalize/enrich-service-catalog.mjs` | JSDoc extraction | scan |
| `tools/canonicalize/migrate-unknown-record.mjs` | Round 5.2 codemod template | template |
| `tools/canonicalize/migrate-as-record.mjs` | Round 10 codemod template | template |
| `scripts/ops/check-canonical-duplicates.mjs` | Anti-regression gate | gate |
| `scripts/ops/check-canonical-events.mjs` | Anti-regression gate | gate |

New codemods should follow the `migrate-as-record.mjs` template:
1. Define the EXACT body regex to match (Shape 1) or accept variants (Shape 2)
2. List TARGET files explicitly
3. Verify each match before replacing
4. Compute the right relative import path
5. Insert import near existing imports
6. Run tsc after batch to catch unused imports
7. Be idempotent (re-running is safe)

## Related

- [GRAPHIFY_DUPLICATES.md](GRAPHIFY_DUPLICATES.md) — auto-detected candidate list
- [DUPLICATION_REGISTER.md](DUPLICATION_REGISTER.md) — manually curated cases
- [DEPRECATION_MAP.md](DEPRECATION_MAP.md) — completed migrations
- [CANONICALIZATION_DOD.md](CANONICALIZATION_DOD.md) — mission status
- [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md) — names allowed

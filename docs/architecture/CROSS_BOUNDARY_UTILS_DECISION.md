# Cross-Boundary Utility Duplication — Decision

> **Status:** DECISION RECORDED 2026-05-27 — Option B adopted as INTERIM. Full
> ADR pending (would promote to Option A — `packages/shared/` workspace — once
> the build-cost / deploy-isolation tradeoff is re-evaluated).
> **Scope:** resolves P1 duplication #38 from `docs/architecture/DEPRECATION_MAP.md`.
> **Author:** Wave 3 subagent D, KLOEL canonicalization mission.

---

## 1. Context

Nine utility symbols are duplicated across two deploy units:

- `backend/` — NestJS API (Railway) — imports nothing from `worker/` at runtime.
- `worker/` — BullMQ workers (Railway, separate service) — imports nothing from
  `backend/` at runtime.

Earlier Wave 2A confirmed the boundary is **intentional**: workers ship as an
independent Docker image, do not link the backend node_modules tree, and must
remain deployable without compiling backend code. Backend and worker share
Prisma client generation but not source files.

Consolidating these into a single shared module is therefore **non-trivial**:
it requires either an npm workspace (`packages/shared/`), a published internal
package, or a pre-build bundling step — each adds friction.

## 2. Symbols in scope

For each symbol below: backend source path, worker source path, byte-identical?
(yes / minor / divergent), recommended canonical, drift summary.

### 2.1 `forEachSequential`

- **Backend:** `backend/src/common/async-sequence.ts:9`
- **Worker:** `worker/utils/async-sequence.ts:2`
- **Byte-identical?** No — **minor**.
- **Diff:** Worker has the slightly stricter cast
  `(Array.isArray(items) ? [...items] : Array.from(items as Iterable<T>)) as T[]`.
  Backend uses `Array.isArray(items) ? [...items] : Array.from(items)`.
- **Behavior equivalent?** Yes (both produce a `T[]` and iterate via the same
  recursive `run` closure). Difference is purely a TypeScript inference shim.
- **Recommended canonical:** backend (simpler signature). Worker may keep its
  cast for compiler ergonomics — drift script tolerates whitespace/cast noise.

### 2.2 `findFirstSequential`

- **Backend:** `backend/src/common/async-sequence.ts:27`
- **Worker:** `worker/utils/async-sequence.ts:20`
- **Byte-identical?** No — **minor**, same cast difference as `forEachSequential`.
- **Behavior equivalent?** Yes.
- **Recommended canonical:** backend.

### 2.3 `pollUntil`

- **Backend:** `backend/src/common/async-sequence.ts:48`
- **Worker:** `worker/utils/async-sequence.ts:41`
- **Byte-identical?** **YES**.
- **Behavior equivalent?** Identical signature, identical implementation.
- **Recommended canonical:** backend (alphabetically wins, no other reason).

### 2.4 `resolveRedisUrl`

- **Backend:** `backend/src/common/redis/resolve-redis-url.ts:190`
- **Worker:** `worker/resolve-redis-url.ts:190`
- **Byte-identical?** **YES** (entire 218-line file is identical).
- **Behavior equivalent?** Yes.
- **Recommended canonical:** backend.
- **Existing stricter gate:** `scripts/ops/check-redis-resolver-sync.mjs` already
  enforces byte-identity for this entire file (the `maskRedisUrl` and
  `RedisConfigurationError` exports below are covered by the same gate). The
  new cross-boundary drift gate is **complementary**, not redundant — it
  detects symbol-level drift, the existing one detects file-level drift.

### 2.5 `safeResolve`

- **Backend:** `backend/src/common/safe-path.ts:17`
- **Worker:** `worker/safe-path.ts:4`
- **Byte-identical?** No — **divergent (cosmetic)**.
- **Diff summary:**
  - Backend uses `import * as path from 'node:path'`; worker uses default
    `import path from 'node:path'` (both equivalent under `esModuleInterop`).
  - Backend uses `Array<string>` parameter type; worker uses `string[]`.
  - Error messages differ: backend says `'safeResolve: segment must be a string,
    received <type>'` and `'safeResolve: null byte in segment'`; worker says
    `'safeResolve: non-string segment'` and `'safeResolve: null byte'`.
  - Backend also exports a sibling `safeJoin` (worker does not).
- **Behavior equivalent?** Yes for `safeResolve` semantics; backend has a
  larger surface (extra `safeJoin`). Error messages are not part of public
  contract (no caller parses them).
- **Recommended canonical:** backend (richer + clearer error messages).
- **Drift risk:** LOW — both validate the same two invariants
  (string + null-byte). The script will tolerate error-string differences but
  will not tolerate semantic divergence (e.g. removing the null-byte check).

### 2.6 `renderTemplate`

- **Backend:** `backend/src/common/sales-templates.ts:76`
- **Worker:** `worker/constants/sales-templates.ts:76`
- **Byte-identical?** **YES** (entire file is identical, including
  `SALES_TEMPLATES`, `TemplateVars`, helpers).
- **Behavior equivalent?** Yes.
- **Recommended canonical:** backend.
- **Existing stricter gate:** `scripts/ops/check-constants-sync.mjs` already
  enforces file-level byte-identity per the file's own preamble comment. The
  new symbol-level cross-boundary gate is complementary.

### 2.7 `toPrismaJsonValue`

- **Backend:** `backend/src/common/prisma/prisma-json.util.ts:16`
- **Worker:** `worker/utils/prisma-json.util.ts:37`
- **Byte-identical?** No — **divergent (semantic)**.
- **Diff summary:**
  - Backend factors scalars + plain-object detection into a sibling helper
    `./prisma-json-scalar.util` (`coerceScalarJson`, `isPlainJsonObject`).
  - Backend ALSO exports `toPrismaJsonArray`; worker does not.
  - Backend's `coerceObjectEntries` returns `Record<string, InputJsonValue | null>`
    and explicitly passes `null` through; worker's `coerceObject` returns
    `Record<string, InputJsonValue>` and relies on the early `null` short-circuit
    inside `toPrismaJsonValue`.
  - Worker has an explicit `if (value === null) return null as never as ...`
    branch at the top of the function; backend handles null via the scalar
    coercer + object short-circuit pattern.
- **Behavior equivalent?** Probably yes for all real inputs (both return null
  for null, both coerce primitives, both recurse arrays/objects, both throw on
  Date/bigint/function). However the **code path for null differs** (worker
  short-circuits explicitly; backend delegates to `coerceScalarJson`). Any
  future change to one is at meaningful risk of skewing the other.
- **Recommended canonical:** backend (richer extraction, also exports
  `toPrismaJsonArray`). Worker should be re-aligned in a follow-up PR.
- **Drift risk:** **MEDIUM** — this is the only pair where a one-sided edit
  could plausibly change behavior. The drift script will flag this pair as
  divergent today.

### 2.8 `maskRedisUrl`

- **Backend:** `backend/src/common/redis/resolve-redis-url.ts:108`
- **Worker:** `worker/resolve-redis-url.ts:108`
- **Byte-identical?** **YES**.
- **Recommended canonical:** backend.

### 2.9 `RedisConfigurationError`

- **Backend:** `backend/src/common/redis/resolve-redis-url.ts:45`
- **Worker:** `worker/resolve-redis-url.ts:45`
- **Byte-identical?** **YES** (lives in the same identical file).
- **Recommended canonical:** backend.

## 3. Options considered

### Option A — `packages/shared/` npm workspace (proper fix)

- **Pros:** single source of truth; impossible to drift; one place to add tests;
  TypeScript types flow naturally.
- **Cons:**
  - Adds an npm workspace topology to a non-workspace monorepo. Root
    `package.json` is not currently a workspace root.
  - Requires bumping Railway build commands (backend build chain currently runs
    `npm --prefix backend ci` — it would now have to install `packages/shared/`
    too).
  - Increases worker Docker image size unless we add a build step to inline
    the shared code.
  - Significant blast radius — touches root + backend + worker + CI + Railway
    Dockerfiles + every consumer import.
  - **Needs ADR.** This is the kind of decision that belongs in an architecture
    record, not a duplicate-resolution PR.

### Option B — Parallel implementations + drift-detection gate (interim) [ADOPTED]

- **Pros:**
  - Zero runtime impact, zero deploy-topology change, zero CI churn beyond one
    new MJS gate that runs in <1s.
  - JSDoc cross-references on identical pairs make future drift obvious during
    code review.
  - The drift script is a forcing function: any one-sided edit fails the gate.
  - Reversible at any time — Option A can be adopted later without changing
    the current behavior contract.
- **Cons:**
  - Two source files per symbol pair. Cognitive cost when refactoring.
  - The drift script must be maintained as new pairs are added.
  - JSDoc cross-references can rot if a file is renamed without updating both
    sides (mitigated: drift script validates the paths exist).

### Option C — Symlink or pre-build dist mirroring (fragile)

- **Pros:** no source duplication.
- **Cons:**
  - Symlinks break on Windows checkouts (we do not officially support Windows
    development, but contributors sometimes use WSL with mixed FS behavior).
  - Git tracks symlinks as mode 120000 — easy to accidentally clobber on
    `git restore` (which is already forbidden in this repo) or merge
    conflict resolution.
  - Pre-build copy scripts inject magic into every developer workflow
    (`npm install` would have to copy files). Introduces a new failure mode
    where stale copies silently diverge.
- **Recommendation:** rejected. Symlinks especially are forbidden by the
  "REGRA ABSOLUTA — GIT RESTORE PROIBIDO" because reconciling a broken symlink
  often nudges humans toward `git restore`, which can destroy uncommitted work.

## 4. Decision — Option B (interim)

1. Keep both implementations as-is for now (no behavior change).
2. Land `scripts/ops/check-cross-boundary-utils-drift.mjs` as a new gate
   tracked by `package.json` `canonical:check:utils-drift` and appended to the
   `canonical:check` composite.
3. Add JSDoc cross-references to every **byte-identical** pair so future
   editors see the partner location at the point of edit. (Pairs that already
   diverge today are flagged by the script and documented in §2 — they are
   not stamped with the "Cross-boundary canonical" JSDoc, since they are not
   currently canonical to each other.)
4. Re-visit Option A in a dedicated ADR (`docs/adr/0006-shared-packages-workspace.md`,
   to be drafted) once we can quantify the build-time + deploy-topology cost.

## 5. Implementation notes for future readers

- The drift gate runs as part of the `canonical:check` composite. To regenerate
  the JSDoc cross-references after a refactor, update both files manually —
  the script does NOT auto-rewrite source.
- The script does not normalize identifier names — if you rename
  `forEachSequential` in only one place, the gate will fail because the
  exported symbol will no longer be discoverable. That is intentional.
- Whitespace, JSDoc comments, and minor TypeScript-cast noise are normalized
  out of the comparison body. **Semantic** structure (the AST-ish skeleton of
  the function body after stripping comments and collapsing whitespace) is
  what is compared.
- The script is read-only. It never mutates source. It exits 0 if all pairs
  are within tolerance, exits 1 in `--strict` mode if any pair drifts.
- **Per-pair floors for `knownDivergent` pairs.** `safeResolve` (floor 0.80)
  and `toPrismaJsonValue` (floor 0.85) are pinned at their current observed
  similarity. The gate fails only if a pair regresses BELOW its floor; it does
  not require resolving the pre-existing documented divergence. To intentionally
  let a divergent pair drift further (e.g. after a careful refactor), update
  both the floor in the script AND the prose in §2 of this document — they
  must move together so the decision record stays the source of truth.

## 6. Follow-up tickets

- Promote to Option A via ADR-0006 (`packages/shared/` workspace) — owner TBD.
- Re-align `toPrismaJsonValue` worker variant to match backend's helper-factored
  shape (or vice versa) — backlog item, NOT in this PR's scope (would be a
  behavior-equivalent refactor of worker code).
- Consider porting `safeJoin` to worker if any worker call site emerges that
  needs `path.join` validation parity.

# Anti-Regression Gates

> Phase-7 of the Architectural Semantic Canonicalization mission: the machine-enforced
> rules that stop semantic entropy from coming back. This document is the honest registry
> of every canonical gate, **what it actually enforces**, and **whether it blocks CI**.
>
> Referenced by `.github/workflows/canonicalization-gates.yml` and `ARCHITECTURE_INDEX.md`.
> **Last updated:** 2026-06-07.

## How enforcement reaches CI

The **blocking** path is `npm run check:all` → wired into `.github/workflows/ci-cd.yml` (the
required status check). A gate only ratchets real regressions if it is reachable from
`check:all` AND exits non-zero on a new violation.

```
check:all
 ├─ scripts/ops/ci-preflight-fetch-main.sh
 ├─ scripts/ops/check-all-gates.mjs        (math-random, prisma-any, asaas-ban, event-namespace)
 ├─ check:canonical-mind                    (mind-access ratchet)
 ├─ check:canonical-capability              (capability-access ratchet)
 └─ canonical:check                         ← duplicates, events, waha, brain, utils-drift
                                              (added 2026-06-07 — these had teeth but were
                                               not wired into the blocking path before)
```

## Gate registry

| Gate (script) | Enforces | In `check:all`? | Status |
|---|---|---|---|
| `check-canonical-mind-access.mjs` | No NEW direct `prisma.kloelMemory/kloelMessage/chatMessage` access beyond the line-pinned grandfather set | ✅ | **BLOCKING ratchet** |
| `check-canonical-capability-access.mjs` | No NEW raw-provider send / `getWorkspaceId` import beyond grandfather set | ✅ | **BLOCKING ratchet** |
| `check-canonical-duplicates.mjs` | The CAPABILITY_MAP duplicate-capability count does not grow vs committed map | ✅ (via `canonical:check`) | **BLOCKING** (freezes count; does not reduce it) |
| `check-canonical-events.mjs` | All emitted event strings are canonical-form (`domain.entity.action`); no new naming variants | ✅ (via `canonical:check`) | **BLOCKING** |
| `check-no-direct-waha-import.mjs` | No direct WAHA client import outside the canonical channel layer | ✅ (via `canonical:check`) | **BLOCKING** |
| `check-no-direct-brain-imports.mjs` | No direct legacy-Brain imports outside the Mind layer | ✅ (via `canonical:check`) | **BLOCKING** |
| `check-cross-boundary-utils-drift.mjs` | Shared utils (normalizePhone, etc.) are not re-copied across boundaries | ✅ (via `canonical:check`) | **BLOCKING** |
| `check-canonical-services.mjs` | `@Injectable` class-name uniqueness (`--strict`) + `@cluster` domain tag (deferred) | ⚠️ non-strict only | **ADVISORY** — `--strict` currently exits 1 on 3 known dups (ChannelSetupService, ConflictDetectorService, VideoService); wire `--strict` only after those are renamed/merged |
| `check-canonical-vocabulary.mjs` | Vocabulary alias usage (`connection`→`ChannelSession`, `Lead`→`Contact`, …) | ⚠️ advisory | **ADVISORY by design** — identifier-substring matching is too noisy to hard-block (`connection` matches `dbConnection`); `--strict` is a no-op. Real blocking needs AST/type-position matching. Use `--report` to track the migration backlog (641 alias usages as of 2026-06-07) |

## The `canonicalization-gates.yml` workflow

A **non-blocking, status-only** companion workflow runs `scripts/ops/canonical/run-all-gates.mjs`
(math-random, prisma-any, asaas-ban, event-taxonomy-namespace) for visibility. It does NOT gate
merges — the blocking enforcement lives in `check:all` (above).

## Known coverage gaps (honest)

- **Scan scope:** the mind/capability gates scan only `backend/src`; `worker/` dispatch code at
  the worker root (outside `worker/src`) is not covered. New worker-side channel-send duplicates
  would not be caught.
- **Duplicates gate** compares the committed `CAPABILITY_MAP.md` against the working copy; it does
  not re-run `npm run canonical:scan`, so a stale committed map can pass. Run `canonical:scan`
  before relying on it.
- **Vocabulary** and **services `@cluster`** enforcement are advisory pending the AST-matching /
  cluster-baseline work — tracked, not silently green.

## Adding a new gate

1. Write `scripts/ops/check-canonical-<slice>.mjs` with `--strict` (exit 1 on new violation) and a
   line-pinned or count baseline so it ratchets (fails on NEW, tolerates existing debt).
2. Verify it exits 0 on current HEAD.
3. Add it to `canonical:check` (or `check:all` directly) so it blocks CI.
4. Register it in the table above with its real enforcement status.

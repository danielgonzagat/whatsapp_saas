# Worker Canonical Audit

> **Status:** AUDIT — Wave 29 subagent C, KLOEL canonicalization mission.
> **Date:** 2026-05-27.
> **Scope:** static survey of `worker/` to (1) verify cross-boundary util drift,
> (2) catalogue layout anomalies, (3) propose next consolidation waves. No
> breaking changes are introduced by this document.

---

## 1. Current state

### 1.1 File inventory (excluding `node_modules`, `dist`, `coverage`, `test-results`)

| Surface                    | Count |
| -------------------------- | ----: |
| Root `*.ts` (non-spec)     |    47 |
| `processors/` `*.ts`       |    84 |
| - `processors/autopilot/`  |    54 |
| - `processors/cia/`        |    23 |
| - `processors/` root       |     7 |
| `providers/` `*.ts`        |    38 |
| `utils/` `*.ts`            |     9 |
| `scrapers/` `*.ts`         |     3 |
| `contracts/` `*.ts`        |     1 |
| `constants/` `*.ts`        |     1 |
| `lib/` `*.ts`              |     1 |
| `src/utils/` `*.ts`        |     1 (anomaly — see §3.1) |
| `test/` `*.ts`             |    56 |

### 1.2 Top 10 files by LOC (production code; `*.spec.ts` excluded)

| LOC | Path |
| ---:| --- |
| 584 | `worker/flow-engine-global.ts` |
| 512 | `worker/queue.ts` |
| 451 | `worker/processors/cia/contracts.ts` |
| 424 | `worker/processors/cia/conversation-policy.ts` |
| 405 | `worker/flow-node-executor.ts` |
| 399 | `worker/processors/autopilot/scan-decisions.ts` |
| 399 | `worker/processors/cia/cognitive-state/cognitive-state-inference.ts` |
| 396 | `worker/processors/autopilot/cia-cycle-workspace.ts` |
| 383 | `worker/processor.ts` |
| 374 | `worker/processors/autopilot/execution-dispatcher.ts` |

No production file is over the 1k-LOC threshold (god-file gate). The
`flow-engine-*` cluster (14 files at root) and the `processors/autopilot/`
cluster (54 files) carry the bulk of the codebase but are already decomposed.

### 1.3 Real BullMQ workers (12) vs lazy queues (10)

```
BullMQ Worker instances (12):
  worker/processor.ts:232               → flow-jobs           (flowWorker)
  worker/scraper-processor.ts:133       → scraper-jobs
  worker/campaign-processor.ts:143      → campaign-jobs
  worker/voice-processor.ts:249         → voice-jobs
  worker/media-processor.ts:11          → media-jobs
  worker/processors/crm-processor.ts:16          → crm-jobs (ghostCloserWorker)
  worker/processors/mass-send-processor.ts:55    → mass-send
  worker/processors/autopilot-processor.ts:27    → autopilot-jobs
  worker/processors/memory-processor.ts:298      → memory-jobs
  worker/processors/silent-24h-resolver-processor.ts:27 → (consumes autopilot-jobs by name? see §3.4)
  worker/processors/webhook-processor.ts:13      → webhook-jobs
  worker/queue.ts:406                   → <legacy Queue.on('job') generic Worker — see §3.4>

lazyQueue() exports (10):
  flowQueue       'flow-jobs'
  campaignQueue   'campaign-jobs'
  scraperQueue    'scraper-jobs'
  mediaQueue      'media-jobs'
  voiceQueue      'voice-jobs'
  memoryQueue     'memory-jobs'
  crmQueue        'crm-jobs'
  autopilotQueue  'autopilot-jobs'
  webhookQueue    'webhook-jobs'
  massSendQueue   'mass-send'
```

`MACHINE_STATE.md §4` currently claims **11 lazy queues / 10 real processors**.
The repo-truth is **10 lazy queues / 11 real processors** (excluding the
legacy generic Worker in `queue.ts`). MACHINE_STATE's processor list also
mixes providers (`fact-extractor`, `checkout-social-lead-enrichment`,
`prepaid-wallet-*`) with real BullMQ processors. Recommend a one-line
correction in a follow-up wave.

---

## 2. Cross-boundary helpers

### 2.1 Drift gate state (`npm run canonical:check:utils-drift`)

OK — all 13 cross-boundary util pairs within tolerance. Snapshot:

| Symbol                    | Backend                                                 | Worker                                  | Score |
| ------------------------- | ------------------------------------------------------- | --------------------------------------- | ----: |
| `forEachSequential`       | `backend/src/common/async-sequence.ts`                  | `worker/utils/async-sequence.ts`         | 0.984 |
| `findFirstSequential`     | `backend/src/common/async-sequence.ts`                  | `worker/utils/async-sequence.ts`         | 0.987 |
| `pollUntil`               | `backend/src/common/async-sequence.ts`                  | `worker/utils/async-sequence.ts`         | 1.000 |
| `resolveRedisUrl`         | `backend/src/common/redis/resolve-redis-url.ts`         | `worker/resolve-redis-url.ts`            | 1.000 |
| `maskRedisUrl`            | `backend/src/common/redis/resolve-redis-url.ts`         | `worker/resolve-redis-url.ts`            | 1.000 |
| `RedisConfigurationError` | `backend/src/common/redis/resolve-redis-url.ts`         | `worker/resolve-redis-url.ts`            | 1.000 |
| `safeResolve`             | `backend/src/common/safe-path.ts`                       | `worker/safe-path.ts`                    | 0.827 (knownDivergent, floor 0.80) |
| `renderTemplate`          | `backend/src/common/sales-templates.ts`                 | `worker/constants/sales-templates.ts`    | 1.000 |
| `toPrismaJsonValue`       | `backend/src/common/prisma/prisma-json.util.ts`         | `worker/utils/prisma-json.util.ts`       | 0.870 (knownDivergent, floor 0.85) |
| `extractAsciiDigits`      | `backend/src/common/phone/phone-normalization.util.ts`  | `worker/utils/phone-normalization.util.ts` | 1.000 |
| `normalizePhone`          | `backend/src/common/phone/phone-normalization.util.ts`  | `worker/utils/phone-normalization.util.ts` | 1.000 |
| `extractPhoneFromChatId`  | `backend/src/common/phone/phone-normalization.util.ts`  | `worker/utils/phone-normalization.util.ts` | 1.000 |
| `phonesMatch`             | `backend/src/common/phone/phone-normalization.util.ts`  | `worker/utils/phone-normalization.util.ts` | 1.000 |

The decision in `docs/architecture/CROSS_BOUNDARY_UTILS_DECISION.md` (Option B,
"interim mirror under drift gate") is holding. No regression detected in this
audit cycle.

### 2.2 Mirror pattern coverage today

The drift gate covers these helper *families*:

- async-sequence (`forEachSequential`, `findFirstSequential`, `pollUntil`)
- redis (`resolveRedisUrl`, `maskRedisUrl`, `RedisConfigurationError`)
- safe-path (`safeResolve` — knownDivergent)
- sales-templates (`renderTemplate`)
- prisma-json (`toPrismaJsonValue` — knownDivergent)
- phone-normalization (4 fns)

### 2.3 Worker-only helpers not currently in the drift gate

These live in `worker/utils/` and have **no backend twin**, so the drift gate
correctly excludes them. Each is fine as worker-local:

| File                         | LOC | Used by | Note |
| ---------------------------- | --:| ------- | ---- |
| `error-message.ts`           | ~3  | 23 sites | Trivial `getErrorMessage(unknown): string`. Backend has a 1-arg variant returning `string \| undefined` inside `request-logger.interceptor.ts` — different contract, do not consolidate. |
| `prompt-sanitizer.ts`        | ~150 | autopilot, flow | Worker-only AI input scrubber. Backend has a NestJS middleware variant (`backend/src/common/middleware/prompt-sanitizer.middleware.ts`) but the contract differs (Express middleware vs pure function). Do not consolidate without a wrapping decision. |
| `safe-eval.ts`               | ~120 | flow-node-executor | mathjs-sandbox expression evaluator. Worker-only. |
| `signed-storage-url.ts`      | ~50 | media, voice | S3/storage signed URL helper. Worker-only. |
| `ssrf-protection.ts`         | ~80 | webhook, flow | Outbound URL validator. Worker-only — though SSRF protection arguably should be cross-boundary; revisit in a future wave. |
| `memory-text-splitter.ts`    | ~80 | memory-processor only | Algorithm-internal split, single caller. Worker-local is correct. |

---

## 3. Layout anomalies

### 3.1 Anomalous `worker/src/utils/error-handler.ts`

**This is the only file under `worker/src/`** — everything else lives directly
in `worker/` or `worker/utils/`. Likely an old codemod artifact. 23 import
sites reference `./src/utils/error-handler`.

**Impact:** low (just a directory layout oddity). **Risk to move:** medium
(touches 23 files including 3 root processors). **Recommendation:** schedule a
dedicated small wave to relocate to `worker/utils/error-handler.ts`. Not a
"small win" candidate for this audit — too many call sites.

### 3.2 Dual processor locations

Some `*-processor.ts` files live at the worker root (`scraper-processor.ts`,
`campaign-processor.ts`, `voice-processor.ts`, `media-processor.ts`), others
in `worker/processors/`. The root processors are older. The cleanup would be
to migrate root processors into `worker/processors/` — but each move breaks
imports and risks Railway runtime regressions. Defer.

### 3.3 14 `flow-*` files at worker root

`flow-engine-*` (6 files) + `flow-node-executor.*` (6 files) + 2 helpers all
sit at the worker root. They form a clear cluster that could live under
`worker/flow/` — but again, this is a layout move with no functional gain.
Defer.

### 3.4 `silent-24h-resolver-processor.ts` queue ownership

`silent24hResolverWorker` is created in `worker/processors/silent-24h-resolver-processor.ts`
but I did not find a dedicated `silent24hQueue` in `worker/queue.ts`. It likely
listens on `autopilot-jobs` by name (worth verifying in a follow-up). If true,
two `Worker` instances on the same queue may compete — known anti-pattern.
Flagging for investigation.

### 3.5 Tiny `worker/lib/colors.ts` (14 LOC, 1 constant)

Single constant `PIPELINE_COLORS.DEFAULT_STAGE = '#3B82F6'`. Mirrors the more
complete `backend/src/common/kloel-colors.ts`. Could either be (a) absorbed by
`worker/constants/`, or (b) added to the drift gate as a thirteenth pair.
Option (b) is cheaper and consistent with the rest of the cross-boundary
strategy.

---

## 4. Backend dependencies (worker → backend)

**Verified:** zero source-level imports of `backend/...` paths from worker:

```
$ grep -rEn "from ['\"].*backend/" worker --include='*.ts' | grep -v node_modules | grep -v dist
(no matches)
```

The deploy boundary is intact. Worker remains shippable without compiling
backend code. NestJS leak audit: 0 `@nestjs/*` imports in worker.

---

## 5. Duplicates to consolidate — priority list

| Priority | Item | Effort | Risk | Notes |
| -------- | ---- | ------ | ---- | ----- |
| **P3** | Relocate `worker/src/utils/error-handler.ts` → `worker/utils/error-handler.ts` | M (23 import sites) | Low | Pure rename; codemod-friendly. Worth a dedicated wave. |
| **P3** | Add `worker/lib/colors.ts` to drift gate | XS (1 PR) | Low | Either fold into `worker/constants/` or extend `scripts/ops/check-cross-boundary-utils-drift.mjs` with a 14th pair. |
| **P3** | Correct `MACHINE_STATE.md §4` queue/processor counts | XS | Low | 10 lazy queues / 11 real Workers, not 11/10. Also distinguish providers from processors in the bullet list. |
| **P4** | Investigate `silent-24h-resolver` queue ownership | XS | Low | Confirm it listens on `autopilot-jobs` or its own (undeclared) queue. |
| **P5** | Consider `worker/flow/` subdir for the 14 root flow files | M | Medium | Layout-only; defer until canonical-domains wave includes flow engine. |
| **P5** | Consider `worker/processors/` subdir for root `*-processor.ts` files | M | Medium | Layout-only; ditto. |

No P0/P1/P2 items found in this audit. The major cross-boundary duplication
work was done by Wave 3F (phone), Wave 3 D/F (CROSS_BOUNDARY_UTILS_DECISION),
and earlier waves. The remaining items are layout polish.

---

## 6. Recommended next waves

1. **Wave 29B-worker-relocate** — codemod `./src/utils/error-handler` →
   `./utils/error-handler` across 23 sites; delete empty `worker/src/`
   directory. (~30 min.)

2. **Wave 29C-worker-colors-gate** — either inline `PIPELINE_COLORS` into a
   matching backend export and add to the drift gate, or merge `worker/lib/`
   into `worker/constants/`. Reduces directory cardinality.

3. **Wave 29D-machine-state-fixup** — patch `docs/architecture/MACHINE_STATE.md`
   §4 to reflect the real `lazyQueue`/`Worker` counts and distinguish
   processors from providers. ≤10 LOC change.

4. **Wave 29E-silent24h-queue-trace** — read-only investigation: confirm
   queue name for `silent24hResolverWorker`, document in canonical event
   taxonomy, add explicit `silent24hQueue` if missing.

5. **Wave 30-flow-engine-folder** — *(low priority, layout only)* fold the
   14 `flow-*.ts` root files into `worker/flow/`. Pure directory move with
   import rewrite.

None of the above blocks the canonicalization mission's P0/P1 items in
`DUPLICATION_REGISTER.md` or `DEPRECATION_MAP.md`. They are hygiene work to
keep the worker layout as predictable as backend's.

---

## 7. References

- `docs/architecture/CROSS_BOUNDARY_UTILS_DECISION.md` — canonical decision
  on the mirror-+-gate pattern.
- `docs/architecture/MACHINE_STATE.md` §4 — current (slightly stale)
  worker counts.
- `docs/architecture/DEPRECATION_MAP.md` — duplication register.
- `scripts/ops/check-cross-boundary-utils-drift.mjs` — drift gate
  implementation; extend here when adding new cross-boundary pairs.

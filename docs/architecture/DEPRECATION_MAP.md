# Kloel Deprecation Map

> Tracks each symbol marked as deprecated, with its replacement and migration deadline.

| Deprecated symbol | Replacement | Deadline | Status |
|---|---|---|---|
| `PipelineService` / `PipelineController` admin-variant at `backend/src/admin/pipeline/pipeline.{service,controller}.ts` (P0 dup #34) | Renamed to `AdminPipelineService` / `AdminPipelineController` at `backend/src/admin/pipeline/admin-pipeline.{service,controller}.ts`. Product-multi-tenant variant at `backend/src/pipeline/*` remains canonical and unchanged. `AdminPipelineModule` export name preserved, so `backend/src/admin/admin.module.ts:21` import is unaffected. | 2026-05-27 | RESOLVED 2026-05-27 — class+file rename complete, all 34 specs pass, `check-canonical-services.mjs` no longer flags `PipelineService` as a duplicate. |
| `backend/src/email/email-inbound.controller.ts` (`EmailInboundController` duplicate, P0 dup #36) | `backend/src/marketing/email-inbound.controller.ts` (canonical per ADR-0012 OmniCore — email is a marketing channel), wired in `MarketingModule`. | 2026-05-27 | REMOVED 2026-05-27 — email/ variant deleted, canonical wired in `MarketingModule`. Service `EmailInboundService` still lives at `backend/src/email/email-inbound.service.ts` until ADR-0012 Wave W3 relocates it to `marketing/channels/email/`. |

---

## Wave M5 Progress — ADR-0013 Mind Unification

> Physical move of Mind* services from `backend/src/kloel/` flat layout into canonical sub-areas under `backend/src/kloel/mind/{core,inference,policy,memory,perception,runtime,synthetic,observability}/`. Each landed batch leaves a `@deprecated` re-export stub at the old path; stubs expire 4 weeks after the batch lands.

| Batch | Services | Sub-Area | Report | Status | Alias Sunset |
|---|---|---|---|---|---|
| Batch 1 | `mind-bandit`, `mind-policy` (initial), `mind-belief` | policy / inference | `MIND_M5_MOVE_BATCH_1_REPORT.md` | landed | 2026-06-17 |
| Batch 2 | `mind-policy` (harness), `mind-belief` (follow-up) | policy / inference | `MIND_M5_MOVE_BATCH_2_REPORT.md` | landed | 2026-06-18 |
| Batch 3 | `mind-predictor`, `mind-surprise` | inference | `MIND_M5_MOVE_BATCH_3_REPORT.md` | landed | 2026-06-19 |
| Batch 4 | `mind-perception`, `mind-event-processor`, `mind-processor` | perception / runtime | `MIND_M5_MOVE_BATCH_4_REPORT.md` | landed | 2026-06-20 |
| Batch 5 | `mind-case-memory`, `mind-concepts`, `mind-global-prior`, `mind-verbalizer` | memory / synthetic | — | landed (referenced by batch 6) | 2026-06-22 |
| Batch 6 | `mind-guards`, `mind-guard-context-builder`, `mind-quality` | policy | `MIND_M5_MOVE_BATCH_6_REPORT.md` | landed | 2026-06-23 |
| Batch 7 | `mind-simulator`, `mind-synthetic-generator`, `mind-workspace-state` | synthetic / memory | `MIND_M5_MOVE_BATCH_7_REPORT.md` | landed | 2026-06-24 |

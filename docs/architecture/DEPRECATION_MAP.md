# Kloel Deprecation Map

> Tracks each symbol marked as deprecated, with its replacement and migration deadline.

| Deprecated symbol | Replacement | Deadline | Status |
|---|---|---|---|
| `PipelineService` / `PipelineController` admin-variant at `backend/src/admin/pipeline/pipeline.{service,controller}.ts` (P0 dup #34) | Renamed to `AdminPipelineService` / `AdminPipelineController` at `backend/src/admin/pipeline/admin-pipeline.{service,controller}.ts`. Product-multi-tenant variant at `backend/src/pipeline/*` remains canonical and unchanged. `AdminPipelineModule` export name preserved, so `backend/src/admin/admin.module.ts:21` import is unaffected. | 2026-05-27 | RESOLVED 2026-05-27 — class+file rename complete, all 34 specs pass, `check-canonical-services.mjs` no longer flags `PipelineService` as a duplicate. |

# PR 484 Gate Closure Proof

This note records the functional proof used for the PR 484 gate recovery
changeset.

Verified locally on 2026-06-03:

- `npm run readiness:check`: 217 passes, 0 failures.
- `GITHUB_BASE_REF=main npm run check:all`: all gates passed.
- `node scripts/ops/canonical/run-all-gates.mjs`: 4/4 gates passed.
- `git push origin HEAD:feat/kloelgraph-prototype-engine`: pre-push validation passed
  before the c8a25f9d upload.

Correction on 2026-06-03:

- The large cleanup deletions in PR 484 are approved and must stay deleted.
- The temporary restoration of agent prompt/skill files, PULSE runtime files,
  PULSE root artifacts, `.claude/settings.json`, and `ratchet.json` was removed.
- Production-readiness and deploy-production were realigned so the PR gate does
  not resurrect deleted PULSE surfaces or local-only governance artifacts.
- Remaining gate work should validate the surviving runtime surfaces and the
  Prisma migration chain, not cancel approved cleanup deletions.

Additional migration gate proof for `abb90d1cc` on 2026-06-03:

- Reproduced the Dependabot `Prisma generate and migrate` failure against a
  clean temporary `pgvector/pgvector:pg15` Postgres database on port `55432`.
- Fixed duplicate/out-of-order migrations so clean databases and existing
  Sites databases both have an idempotent path.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:55432/whatsapp_saas_test npx prisma generate`:
  generated Prisma Client successfully.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:55432/whatsapp_saas_test npx prisma migrate deploy`:
  applied all 73 migrations successfully, including
  `20260602130000_add_mind_self_model_table`,
  `20260602130100_add_site_tables_align_mind_defaults`,
  `20260602140000_add_contact_funnel_cols_and_site_legacy_id`,
  `add-sites-domains-apps`, and
  `zz_20260602150000_add_site_legacy_id`.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:55432/whatsapp_saas_test npm --prefix backend run prisma:validate`:
  `schema.prisma` is valid.

Additional PR gate proof for the 2026-06-03 gate-recovery commits:

- The PULSE spec deletions are approved as part of the PR 484 cleanup and are
  recorded in `ops/test-deletion-approvals.json`; the deleted specs imported
  `scripts/pulse/**` modules that were already removed by the approved cleanup.
- `npm run check:tests`: passed with 1547 test files and 34622 `expect()` calls.
- `npm run check:casts`: passed after replacing the PERSON backfill runner double
  cast with a typed Prisma adapter.
- `npm run check:queries`: passed after making the PERSON backfill runner
  `workspaceId` filters explicit in Prisma query literals.
- `npm --prefix backend run typecheck`: passed after the typed Prisma adapter
  change.
- `npm run check:all`: passed all gates locally after the deletion approvals and
  runner adapter fixes.

Additional cleanup-deletion approval for the 2026-06-07 canonicalization (PR #488):

- The large cleanup deletions in PR 484 are approved and must stay deleted.
- Two proven-dead orphan services were removed during the duplication sweep,
  together with their specs (the specs covered now-non-existent source):
  - `backend/src/kloel/kloel-global-prior.service.ts` + `.spec.ts` (P2-7):
    `KloelGlobalPriorService` was `@deprecated` with ZERO injectors; its bridge
    methods already live in `MindGlobalPriorService` over `RAC_MindGlobalPrior`.
  - `backend/src/checkout/mercado-pago-pix.service.ts` + `.spec.ts` +
    `.webhook.spec.ts` (P2-15): an orphan `MercadoPagoPixService` duplicate with
    zero callers; the canonical PIX charge path is `MercadoPagoPixChargeService`.
- Both removals were grep-proven dead (no remaining references) and verified by
  backend `tsc -p tsconfig.build.json --noEmit` exit 0. Owner-approved cleanup.

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

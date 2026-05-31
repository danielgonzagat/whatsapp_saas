# WhatsApp Shim Final Drop Plan

> Subagent C — Wave 31. Concrete, executable plan to delete the last two
> compatibility shims under `backend/src/whatsapp/` and free the directory for
> a clean `rm -rf backend/src/whatsapp/`.

## 1. Current State

`backend/src/whatsapp/` now contains only two stub files re-exporting from the
canonical `backend/src/marketing/channels/whatsapp/` tree:

| Stub | Canonical target | Consumer files |
| --- | --- | --- |
| `backend/src/whatsapp/provider-settings.types.ts` | `backend/src/marketing/channels/whatsapp/provider-settings.types.ts` | 40 unique files |
| `backend/src/whatsapp/providers/provider-registry.ts` | `backend/src/marketing/channels/whatsapp/providers/provider-registry.ts` | 40 unique files |

- Raw import-site count: **80** (`grep -rEn` matches).
- Unique consumer files (excluding the two shim self-references):
  **73**.
- Files importing **both** shims: **5** (`workspaces/workspace.controller.ts`,
  `marketing/marketing-connect/channel-setup.service.ts`,
  `kloel/kloel-tool-executor-whatsapp.service.ts` and its specs).
- Worker references: **0** — `worker/` already moved off these paths.

Once every consumer is rewritten to the canonical path the two shim files plus
the empty `backend/src/whatsapp/` and `backend/src/whatsapp/providers/`
directories can be deleted in a final commit. No new code is introduced; this
is a pure import-path migration.

## 2. Consumer Buckets (73 files)

Grouped by source directory, sorted by file count. The "rewrite anchor"
column gives the literal `from '...'` prefix used in the imports in that
directory (verified via `grep`).

| # | Module bucket | Files | Rewrite anchor (FROM → TO) |
| --- | --- | --- | --- |
| 1 | `backend/src/marketing/channels/whatsapp/` (root) | 21 | `'../../../whatsapp/...'` → `'../...'` |
| 2 | `backend/src/kloel/` | 17 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 3 | `backend/src/kloel/mind/cia/` | 6 | `'../../../whatsapp/...'` → `'../../../marketing/channels/whatsapp/...'` |
| 4 | `backend/src/workspaces/` | 5 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 5 | `backend/src/marketing/marketing-connect/` | 4 | `'../../whatsapp/...'` → `'../channels/whatsapp/...'` |
| 6 | `backend/src/webhooks/` | 2 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 7 | `backend/src/marketing/channels/whatsapp/controllers/` | 2 | `'../../../../whatsapp/...'` → `'../../...'` |
| 8 | `backend/src/marketing/` (root) | 2 | `'../whatsapp/...'` → `'./channels/whatsapp/...'` |
| 9 | `backend/src/integrations/` | 2 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 10 | `backend/src/admin/accounts/queries/` | 2 | `'../../../whatsapp/...'` → `'../../../marketing/channels/whatsapp/...'` |
| 11 | `backend/src/tiktok-ads/` | 1 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 12 | `backend/src/meta/` | 1 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 13 | `backend/src/marketing/marketing-connect/shared/` | 1 | `'../../../whatsapp/...'` → `'../../channels/whatsapp/...'` |
| 14 | `backend/src/launch/` | 1 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 15 | `backend/src/kloel/guards/` | 1 | `'../../whatsapp/...'` → `'../../marketing/channels/whatsapp/...'` |
| 16 | `backend/src/dashboard/` | 1 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 17 | `backend/src/calendar/` | 1 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 18 | `backend/src/billing/` | 1 | `'../whatsapp/...'` → `'../marketing/channels/whatsapp/...'` |
| 19 | `backend/src/admin/config/` | 1 | `'../../whatsapp/...'` → `'../../marketing/channels/whatsapp/...'` |
| 20 | `backend/src/admin/accounts/` | 1 | `'../../whatsapp/...'` → `'../../marketing/channels/whatsapp/...'` |

Total: **73 unique files**. The `...` suffix after `whatsapp/` is always one of
`provider-settings.types` or `providers/provider-registry`.

## 3. Per-Bucket Migration Recipe

Every rewrite is a single `from '<old>' ` → `from '<new>'` substitution; no
identifier renames, no type changes. Verified pattern per bucket:

- **Bucket 1 — `marketing/channels/whatsapp/` (21 files)**: replace
  `'../../../whatsapp/provider-settings.types'` with
  `'../provider-settings.types'` and
  `'../../../whatsapp/providers/provider-registry'` with
  `'../providers/provider-registry'`.
- **Bucket 2 — `kloel/` (17 files)**: replace `'../whatsapp/<X>'` with
  `'../marketing/channels/whatsapp/<X>'`.
- **Bucket 3 — `kloel/mind/cia/` (6 files)**: replace
  `'../../../whatsapp/<X>'` with `'../../../marketing/channels/whatsapp/<X>'`.
- **Bucket 4 — `workspaces/` (5 files)**: replace `'../whatsapp/<X>'` with
  `'../marketing/channels/whatsapp/<X>'`.
- **Bucket 5 — `marketing/marketing-connect/` (4 files)**: replace
  `'../../whatsapp/<X>'` with `'../channels/whatsapp/<X>'`.
- **Bucket 6 — `webhooks/` (2 files)**: replace `'../whatsapp/<X>'` with
  `'../marketing/channels/whatsapp/<X>'`.
- **Bucket 7 — `marketing/channels/whatsapp/controllers/` (2 files)**: replace
  `'../../../../whatsapp/<X>'` with `'../../<X>'`.
- **Bucket 8 — `marketing/` root (2 files)**: replace `'../whatsapp/<X>'` with
  `'./channels/whatsapp/<X>'`.
- **Bucket 9 — `integrations/` (2 files)**: replace `'../whatsapp/<X>'` with
  `'../marketing/channels/whatsapp/<X>'`.
- **Bucket 10 — `admin/accounts/queries/` (2 files)**: replace
  `'../../../whatsapp/<X>'` with `'../../../marketing/channels/whatsapp/<X>'`.
- **Buckets 11–20 (1 file each, 10 files total)**: each uses the same anchor
  as the parent module — apply the per-row mapping in the table above.

`<X>` is `provider-settings.types` or `providers/provider-registry`. No other
files in the stub directory remain, so we never need to touch any other
sub-path.

## 4. Recommended Batch Sizes & Commit Plan

One commit per logical bucket keeps reviewers honest and rollback trivial. The
largest two buckets are split to stay near the 5–10 files / commit guideline.

| Commit | Scope | Files |
| --- | --- | --- |
| 1 | `marketing/channels/whatsapp/` core services (12 of 21) | 12 |
| 2 | `marketing/channels/whatsapp/` specs + helpers (9 of 21) | 9 |
| 3 | `marketing/channels/whatsapp/controllers/` | 2 |
| 4 | `kloel/` services + providers (10 of 17) | 10 |
| 5 | `kloel/` specs (7 of 17) | 7 |
| 6 | `kloel/mind/cia/` | 6 |
| 7 | `kloel/guards/` | 1 |
| 8 | `workspaces/` | 5 |
| 9 | `marketing/marketing-connect/` (incl. `shared/`) | 5 |
| 10 | `marketing/` root + sub-services | 2 |
| 11 | `webhooks/` | 2 |
| 12 | `integrations/` + `tiktok-ads/` | 3 |
| 13 | `admin/` (`accounts/`, `accounts/queries/`, `config/`) | 4 |
| 14 | `billing/`, `calendar/`, `dashboard/`, `launch/`, `meta/` | 5 |
| 15 | Final: delete `backend/src/whatsapp/` (both stub files + empty dirs) | 0 (delete-only) |

**Total commits: 15** (14 rewrite commits + 1 deletion commit).

Each rewrite commit message follows the conventional form
`refactor(canonical): retarget <bucket> off backend/src/whatsapp/ shims`.
The final deletion is
`refactor(canonical): delete backend/src/whatsapp/ shim directory`.

## 5. Per-Commit Procedure

For every rewrite commit:

1. `git checkout -b chore/drop-whatsapp-shim-<bucket-slug>` (or work on
   `homolog` for tiny single-file buckets per the CLAUDE.md exception).
2. Apply the two-line substitution across the bucket's files. Recommended:
   `node` script or `sed -i ''` constrained to those exact paths — never
   repo-wide.
3. `cd backend && npm run lint && npm run build` — must be green.
4. `npm test -- --testPathPattern=<bucket>` if specs live in the bucket.
5. `git add <files> && git commit` (signed, no `--no-verify`).
6. Re-run `grep -rEn "from ['\"].*whatsapp/provider-settings\\.types|from ['\"].*whatsapp/providers/provider-registry" backend/src worker --include='*.ts' | wc -l`.
   The count should decrement by exactly the number of import lines fixed.

## 6. Final Deletion (Commit 15) — Safety Gate

Only execute the final deletion when **all** of the following hold:

```sh
grep -rEn "from ['\"].*whatsapp/provider-settings\\.types|from ['\"].*whatsapp/providers/provider-registry" \
  backend/src worker --include='*.ts'
```

returns **0 lines** (excluding the two shim files re-exporting from canonical,
which are themselves about to be deleted).

Additional gates before `rm`:

1. `cd backend && npm run lint && npm run build && npm test` — fully green.
2. `npm run guard:db-push && npm run typecheck` at repo root.
3. `npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/index.ts`
   does not regress any WhatsApp / provider-registry health row.
4. Worker bundle still builds (`cd worker && npm run build`) — confirms
   nothing migrated into the worker silently picked up a stale resolver.

Then:

```sh
git rm backend/src/whatsapp/provider-settings.types.ts
git rm backend/src/whatsapp/providers/provider-registry.ts
rmdir backend/src/whatsapp/providers backend/src/whatsapp
git commit -m "refactor(canonical): delete backend/src/whatsapp/ shim directory"
```

`backend/src/whatsapp/` ceases to exist. Canonical path
`backend/src/marketing/channels/whatsapp/` is the only WhatsApp module
anchor in the backend.

## 7. Risk & Rollback

- **Risk class**: medium-low. Pure path rewrite, no behavior change, no
  Prisma / API / Stripe surface. Build + tests catch any regression
  immediately.
- **Rollback**: each commit is independently revertable (`git revert`).
  Because the canonical files already exist, reverting only restores import
  paths — no missing-symbol cliff.
- **Concurrency**: do **not** interleave with active work in
  `marketing/channels/whatsapp/` or `kloel/`; merge the rewrite first, then
  resume feature work to avoid `from '...'` collisions during rebase.

## 8. Out of Scope

- No renames of `ProviderSettings`, `asProviderSettings`,
  `WhatsAppProviderRegistry`, or any exported identifier.
- No deletion of canonical files under `marketing/channels/whatsapp/`.
- No worker changes (already off the stubs).
- No protected-file edits.

Stop conditions: any protected file would have to be touched; any build/test
red after a rewrite commit (revert that commit, diagnose, retry).

# Visual Regression Baselines (Wave 3 P6.5-1, I20)

This directory contains the **enforcement mechanism** for the Wave 3
frontend freeze. Every PR in Wave 3 (and beyond) must produce zero
pixel diff against the committed baselines for the 15 critical screens
across 3 viewports (mobile / tablet / desktop). A diff fails CI.

## Why visual regression?

The Wave 3 plan defines "frontend freeze" as: **no changes to any
rendered UI, layout, copy, CSS, component tree, route URLs, or visible
DOM**. Backend-adjacent client code (`frontend/src/lib/http.ts`, error
contract handling, bootstrap sequencing) is in scope when the change
has zero visible effect on the user.

The hard part is _proving_ the "zero visible effect" claim. Visual
regression is how we do it: every PR runs Playwright against the 15
critical screens, captures full-page screenshots, and diffs them
against the committed baselines. Any pixel diff fails the build.

## How it works

Playwright's `expect(page).toHaveScreenshot(name)` API:

1. **First run** (no baseline yet): the test FAILS, but Playwright
   writes the actual screenshot to the snapshot directory. The
   operator inspects it, decides if it is acceptable, and commits.
2. **Subsequent runs**: Playwright compares the new screenshot
   against the committed baseline byte-for-byte (with
   `maxDiffPixelRatio: 0`, `threshold: 0`). Any pixel diff fails.

## First-time baseline capture

Run against a known-good staging environment:

```bash
cd e2e
export E2E_FRONTEND_URL=https://staging.kloel.com
export E2E_API_URL=https://api-staging.kloel.com
export E2E_ADMIN_EMAIL=admin+e2e@example.com
export E2E_ADMIN_PASSWORD=...
npx playwright test --project=visual --update-snapshots
```

Inspect the captured screenshots in
`critical-flows.spec.ts-snapshots/` (or similar — Playwright derives
the directory name from the spec). Verify each one shows the
expected page in the expected state. Then commit them:

```bash
git add e2e/visual/critical-flows.spec.ts-snapshots/
git commit -m "feat(visual): seed Wave 3 baseline screenshots (P6.5-1)"
```

## Updating baselines (intentional visual changes)

If a PR DELIBERATELY changes the visual surface (e.g. an approved
copy update or a new design system token), the operator must:

1. Tag the PR with the `VISUAL_CHANGE_APPROVED` label so reviewers
   acknowledge the intentional change.
2. Run `npx playwright test --project=visual --update-snapshots`
   in the PR branch to refresh the baselines.
3. Commit the updated snapshots in the same PR.
4. The reviewer manually inspects each updated screenshot in the
   PR diff before approving.

Without the `VISUAL_CHANGE_APPROVED` label, CI rejects any PR that
touches files inside `critical-flows.spec.ts-snapshots/`.

## CI integration

`.github/workflows/visual-regression.yml` runs the visual project on
every PR against staging. The workflow:

- Boots Playwright with the same Chromium binary across runs
- Reads baselines from the committed snapshot directory
- Uploads diff PNGs as workflow artifacts on failure
- Fails the PR check if any screenshot diffs

## Authenticated routes

Routes 4–15 (dashboard, products, inbox, etc.) require an
authenticated session. The spec uses
`bootstrapAuthenticatedPage` from `e2e/specs/e2e-helpers.ts` which
seeds cookies + localStorage from `ensureE2EAdmin`. If
`E2E_ADMIN_EMAIL` / `E2E_API_TOKEN` env vars are unset, the
authenticated tests are SKIPPED with a clear message — the
public-route tests still run.

## Maintenance

- **Adding a new screen:** append to the `PUBLIC_ROUTES` or
  `AUTHENTICATED_ROUTES` array in `critical-flows.spec.ts`. Run with
  `--update-snapshots` to capture the baseline. Commit.
- **Removing a screen:** delete from the array AND delete the
  corresponding `.png` files in the snapshot directory.
- **Adding a viewport:** append to the `VIEWPORTS` array. Run
  `--update-snapshots` to capture the new baselines for every screen.

# Visual Freeze Contract — Wave 3 (I20)

## What "frontend freeze" means

The Wave 3 hardening plan declares the frontend visual surface
**frozen**. The precise contract:

> **No changes to any rendered UI, layout, copy, CSS, component tree,
> route URLs, or visible DOM. Backend-adjacent client code
> (`frontend/src/lib/http.ts`, error-contract handling, bootstrap
> sequencing, SWR fetcher wiring) is in scope when the change has
> zero visible effect on the user.**

This contract is enforced by **Playwright visual regression
baselines** captured in P6.5-1. Every PR that lands during Wave 3
(and any future wave that inherits this contract) must produce
**zero pixel diff** across:

- 15 critical-flow screens (see `e2e/visual/critical-flows.spec.ts`)
- 3 viewports (375×812 mobile, 768×1024 tablet, 1440×900 desktop)

The CI workflow `.github/workflows/visual-regression.yml` runs the
visual project on every PR. A diff fails the PR check.

## What is in scope (allowed without baseline change)

Wave 3 ships changes in many backend-adjacent client files. These
are **explicitly allowed** as long as the visual baseline stays
zero-diff:

| File                                       | Wave 3 PR      | Why it's allowed                                    |
| ------------------------------------------ | -------------- | --------------------------------------------------- |
| `frontend/src/lib/http.ts`                 | P6.5-2, P6.5-4 | API client wiring, error handling. No DOM.          |
| `frontend/next.config.js`                  | P6.5-2         | Build-time config. No DOM.                          |
| `frontend/src/lib/auth/session.ts`         | P6.5-3         | Session state. Renders no DOM directly.             |
| `frontend/src/lib/session-guard.tsx` (new) | P6.5-3         | HOC that gates SWR hooks; visual surface unchanged. |
| `frontend/.env.example`                    | P6.5-2         | Env documentation.                                  |
| `frontend/src/app/settings/page.tsx`       | P6.5-3         | Bug fix for crash; loading state already designed.  |
| `frontend/src/app/products/[id]/page.tsx`  | P6.5-3         | Same.                                               |
| `frontend/src/app/products/new/page.tsx`   | P6.5-3         | Same.                                               |

The general rule: **a fix is in scope if and only if its rendered
output is byte-for-byte identical to the pre-fix output for any
state the user can observe.**

A null-crash fix usually qualifies because the broken page rendered
NOTHING (or a stack trace overlay) — the fix renders the correctly-
designed loading state, then the data state, both of which were
already part of the visual contract before the bug existed.

## What is OUT of scope (requires VISUAL_CHANGE_APPROVED)

Any change that produces ANY pixel diff against the committed
baselines requires:

1. **The `VISUAL_CHANGE_APPROVED` GitHub label** on the PR.
2. **Manual reviewer inspection** of every diff PNG attached to the
   workflow artifacts.
3. **A commit refreshing the baseline screenshots** in the same PR.

Without the label, the CI guard
`.github/workflows/visual-regression.yml > Block PR if baselines were
modified without label` fails the PR.

Examples of OUT-OF-SCOPE changes:

- Any change to a Tailwind class that affects rendered styles
- Adding/removing/reordering DOM elements
- Changing copy (button labels, page titles, error messages, copy in
  empty states)
- Changing route URLs
- Adding/removing/reordering navigation items
- Changing SVG icons
- Changing fonts, colors, spacing, border-radius, shadows
- Replacing one component with a "visually equivalent" one (still
  must be byte-for-byte equal in the rendered output)

## How to update baselines (intentional visual changes)

When a PR DOES intentionally change the visual surface (e.g. an
approved design system update or a copy change requested by product),
the operator must:

1. **Request the `VISUAL_CHANGE_APPROVED` label** on the PR. The
   reviewer adds the label after a synchronous review.
2. **Trigger the workflow manually** with the `update_snapshots`
   input set to `true`:

   ```bash
   gh workflow run visual-regression.yml --ref <pr-branch> -f update_snapshots=true
   ```

   The workflow runs Playwright with `--update-snapshots`, capturing
   fresh PNGs.

3. **Commit the updated baselines** to the PR branch. The reviewer
   visually compares each diff in the PR diff view before approving.
4. **Merge.** The merged PR carries both the code change AND the
   matching baseline update atomically.

## Why this is the hard part of the freeze

The freeze is the contract Daniel made when scoping the original
prompt: "não quero mudar nada do front-end em produção". Without
visual regression, every PR's claim of "zero visual change" is
unverifiable. With visual regression, the claim is mechanically
checked on every push.

This is the same pattern that Stripe, Airbnb, Linear, and Vercel
use for their design systems and customer-facing screens. It is the
single highest-leverage piece of infrastructure for preserving a
visual contract while shipping deep backend changes underneath.

## Operator checklist (every Wave 3 PR)

Before merging any Wave 3 PR, the operator confirms:

- [ ] CI `visual-regression` job is GREEN.
- [ ] No files in `e2e/visual/critical-flows.spec.ts-snapshots/` were
      modified by this PR (unless `VISUAL_CHANGE_APPROVED` label).
- [ ] The diff in the PR contains only:
  - Backend code, OR
  - Worker code, OR
  - Schema/migrations, OR
  - Tests, OR
  - Documentation, OR
  - Backend-adjacent frontend client code from the allowed list above.

If any of these is false, the PR does not satisfy the freeze and must
be rejected or split.

## Related

- `e2e/visual/README.md` — operator runbook for capturing baselines
- `e2e/visual/critical-flows.spec.ts` — the spec
- `.github/workflows/visual-regression.yml` — CI enforcement
- Wave 3 plan invariant **I20 — Visual Surface Frozen**

# KLOEL Copilot Review Instructions

Review this repository with a production-hardening mindset.

## Priorities

- Catch security regressions first.
- Catch workspace-isolation leaks first.
- Catch payment, wallet, webhook, and checkout logic regressions first.
- Catch fake or placeholder behavior masquerading as real product behavior.

## What Must Be Flagged

- Any new `prisma db push` usage in production, CI, scripts, or automation.
- Any endpoint or query that forgets `workspaceId` filtering.
- Any webhook path that does not verify provider signatures or tokens.
- Any controller doing heavy business logic inline instead of the service layer.
- Any UI path that adds fake data, `Math.random()` , hardcoded metrics, or false
  success states.
- Any route or component that reintroduces fullscreen loading after login.
- Any missing tests around money movement, auth, products, checkout, wallet, or
  webhooks.
- Any new `any`-heavy code in critical backend/payment flows.

## Naming and Style

- Preserve the existing shell and UX contract. Do not suggest full rewrites when
  a local fix is possible.
- Prefer concrete naming over vague helpers.
- In NestJS, prefer typed Prisma access over new `prismaAny` usage.
- In Next.js, preserve mounted shell and use localized loading states.

## Testing Expectations

Suggest tests whenever code touches:

- auth or session handling,
- Prisma schema or migrations,
- payment status transitions,
- wallet balances,
- public endpoints,
- worker/browser runtime flows.

If a change touches production-critical logic and has no test delta, call that
out explicitly.

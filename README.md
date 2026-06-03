# KLOEL

KLOEL is an AI-native marketing and sales SaaS for WhatsApp commerce. The product combines a Next.js frontend, a NestJS backend, a BullMQ worker, Prisma/Postgres, Stripe, Mercado Pago, Meta WhatsApp Cloud API, Railway, Vercel, tests, and production operations.

This repository should contain only product code, real build/test/deploy configuration, current operational documentation, and quality governance required to keep KLOEL healthy.

## Product Stack

- `frontend/`: Next.js app, public checkout, dashboard, settings, CRM, products, inbox, WhatsApp and KLOEL UI.
- `backend/`: NestJS API, Prisma schema/migrations, auth, checkout, billing, wallet, WhatsApp, CRM, products, analytics, KLOEL mind/runtime and integrations.
- `worker/`: BullMQ worker for async jobs, WhatsApp sends, flows, media, scraping and operational queues.
- `frontend-admin/`: admin frontend.
- `e2e/`: Playwright coverage and route mocks.
- `scripts/ops/`: operational gates, CI checks, deploy/readiness helpers and quality tooling.
- `scripts/cognitive/`: generators for OpenAPI, AsyncAPI, SARIF and SBOM artifacts when needed.
- `scripts/mcp/atomic-edit/`: preserved Atomic MCP editing layer used locally by Daniel.

## Quick Start

```sh
npm install
( cd backend && npm install )
( cd frontend && npm install )
( cd frontend-admin && npm install )
( cd worker && npm install )

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

( cd backend && npx prisma migrate dev )
( cd backend && npm run start:dev )
( cd frontend && npm run dev )
( cd worker && npm run dev )
```

## Validation

```sh
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run lint
npm run test
npm run build
```

Use package-specific commands when debugging a focused area:

```sh
npm run backend:typecheck
npm run frontend:typecheck
npm run worker:typecheck
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix worker run build
```

## Documentation

- `ARCHITECTURE.md`: product architecture entry point.
- `RUNBOOK.md`: operational incidents and recovery.
- `SECURITY.md`: security policy.
- `TESTING.md`: testing strategy.
- `docs/PRODUCTION_DEPLOY.md`: deployment procedure.
- `docs/PRODUCTION_READINESS.md`: production readiness checklist.
- `docs/deployment/env-vars.md`: environment variables.
- `docs/runbooks/`: focused operational runbooks.
- `docs/compliance/`: compliance and external-provider submission notes.
- `docs/architecture/`: current canonical product contracts.
- `docs/contracts/`: domain contracts.

## GitHub Scope

Generated outputs, local caches, historical plans, agent tooling, external MCP tooling, experimental CLIs, old handoffs, and archived reports do not belong in GitHub. They are preserved outside the repository when still useful for Daniel locally.

## License

Proprietary - KLOEL

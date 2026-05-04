# KLOEL Agent Runbook

This document describes how AI coding agents should operate inside KLOEL.

## Mission

Convert the existing KLOEL product shell into a production-grade machine
without destroying the shell.

## Core Loop

1. Inspect
2. Plan
3. Test first when feasible
4. Implement minimal change
5. Verify locally
6. Run PULSE
7. Commit small
8. Report evidence

## Golden Rule

No fake production behavior.

If the integration is not ready, show setup-required/degraded/empty state.
Never use mock data to make the UI look complete.

## Git Safety

AI agents must never run `git restore` in this repository.

This includes `git restore <path>`, `git restore --source`, and
`git restore --staged`. A failed edit must be fixed forward or reverted from an
explicit snapshot captured before the edit. If no safe snapshot exists, stop and
ask the human.

## Standard Commands

### Root

```bash
npm run lint
npm run typecheck
npm test
npm run guard:db-push
```

### Backend

```bash
npm --prefix backend run lint
npm --prefix backend run build
npm run backend:boot-smoke
```

### Frontend

```bash
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

### Worker

```bash
npm --prefix worker run build
```

### Prisma

```bash
npx prisma generate
npx prisma validate
```

### PULSE

```bash
npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/index.ts
npx ts-node scripts/pulse/index.ts --report
```

## Risk Matrix

| Area             | Risk     | Required Validation                |
| ---------------- | -------- | ---------------------------------- |
| Copy/docs        | Low      | Review                             |
| Frontend visual  | Medium   | typecheck/build                    |
| API client/hooks | Medium   | typecheck + test                   |
| Backend service  | High     | unit + build + boot-smoke          |
| Prisma schema    | High     | generate + validate + tests        |
| WhatsApp         | High     | provider mock + smoke              |
| Auth             | Critical | auth tests + isolation tests       |
| Payments         | Critical | idempotency + ledger + split tests |
| Governance       | Critical | human approval                     |

## Payment Checklist

- bigint cents
- no float money
- idempotency
- immutable ledger
- webhook replay safe
- test duplicate events
- test partial failure
- no fake success
- no live secret in code
- ADR respected

## WhatsApp Checklist

- session scoped
- no duplicate send
- incoming message idempotency
- QR lifecycle real
- stop/handoff respected
- no invented product data
- provider unavailable state
- logs without sensitive content

## Frontend Checklist

- API real
- loading state
- empty state
- error state
- success state
- no localStorage DB
- no Math.random
- no fake array
- design tokens
- accessible controls

## Backend Checklist

- DTO validation
- auth guard
- workspace isolation
- service layer
- typed Prisma
- transactions
- logs
- tests
- no mock return
- clear errors

## Report Template

```md
## Summary

## Files Changed

## Validation

## User Flow

## Risks

## Next Step
```

# Atomic-Edit Product Workboard

> Workboard for the product phase. A front is valid only when its atomic lock
> exists under `.atomic-edit-locks/<frontId>/`.

## Active / Recent Fronts

| Front | Owner | Status | Scope | Evidence |
| --- | --- | --- | --- | --- |
| `front-chat-postgres-d7-session-1` | Codex | validated | Admin chat persisted sessions | `backend/src/admin/chat/admin-chat-session.service.ts`; 43 focused chat tests passed |
| `front-backend-typecheck-unused-symbols` | Codex | validated | Backend TS6133 blockers in dirty backlog | `npm --prefix backend run typecheck` passed |
| `front-pulse-compute-import` | Codex | validated | PULSE split-file import regressions | `npm run pulse:json` completed to `NOT_CERTIFIED` certificate |
| `front-atomic-product-apex-mcp-layer` | Codex | validated | Shared MCP product-oriented action layer for Codex/Claude/OpenCode | 25 MCP tools; `smoke.ts` 83/83; `smoke.mjs` 83/83; atomicity auditor pass |

## Current Blocker

PULSE is executable again, but the fresh certificate is `NOT_CERTIFIED`
(`score=55`). D7 remains `em prova`, and the consecutive-green counter remains
`0`.

The next front must attach observed runtime evidence to a real product flow.
Do not build more atomic-edit tooling unless a regression proves the tool is
unusable or Daniel explicitly re-scopes the session, as happened for
`front-atomic-product-apex-mcp-layer`.

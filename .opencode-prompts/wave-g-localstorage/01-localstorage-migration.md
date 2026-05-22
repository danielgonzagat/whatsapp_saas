# Wave G — LocalStorage → Backend Migration (multi-slice, but small targets)

## Mission

Migrate 4 critical localStorage usages from frontend to backend persistence
(per CLAUDE.md REGRA DE FRONTEND: "Não usar localStorage como banco"). Audit
remaining 50+ usages and classify as either UI-prefs (acceptable local) or
business-data (move to backend).

## 4 critical migrations (per A.6 of anexo)

### 1. ChatPersistence-Backend
- File: `frontend/src/components/kloel/useChatController.ts:276,282`
- Current: chat session ID stored in localStorage
- Target: backend `ChatSession` model (already exists per Prisma schema) with
  `userId+workspaceId+deviceId` compound key.
- Required backend: ensure `ChatSessionService` has `getOrCreate({userId, workspaceId, deviceId})`
  + `listForUser({userId, workspaceId, cursor, limit})`.
- Required frontend: replace localStorage.setItem/getItem in useChatController
  with `apiFetch('/api/chat/sessions/...')` via new hook `useChatSessions`.

### 2. AuthOnboardingFlag-Backend
- File: `frontend/src/components/kloel/auth/auth-provider.tsx:120,215,221,309,317,518`
- Current: `ONBOARDING_STORAGE_SLOT` flag in localStorage
- Target: `User.onboardingCompletedAt: DateTime?` column in Prisma (check if
  exists; add migration if missing).
- Required backend: PUT `/api/auth/me/onboarding-complete` endpoint that sets
  the column to NOW. GET `/api/auth/me` includes the column.
- Required frontend: replace localStorage.setItem(ONBOARDING_STORAGE_SLOT, ...)
  with `apiFetch.put('/api/auth/me/onboarding-complete')`. Replace getItem
  reads with the value from the existing `useAuth` hook.

### 3. FloatingChatGuestSession-Backend
- Files: `frontend/src/components/kloel/landing/FloatingChat.tsx:220`,
  `frontend/src/components/kloel/landing/FloatingChat.helpers.ts:145,147`
- Current: guest session id in localStorage
- Target: backend `GuestSession` model already exists. Server-side cookie
  (httpOnly, SameSite=Lax, secure) holding the session token, validated
  server-side on each request.
- Required backend: POST `/api/guest/sessions` returns Set-Cookie. GET
  `/api/guest/sessions/me` reads the cookie.
- Required frontend: replace localStorage with fetch that lets the cookie
  flow naturally.

### 4. CoreTokensCookieMigration
- File: `frontend/src/lib/api/core-tokens-sync.ts:45-47`
- Current: tokens (primary/renewal/workspace) in localStorage
- Target: httpOnly cookies for auth tokens, set by backend on login.
- Required backend: ensure `/api/auth/login` sets Set-Cookie with httpOnly +
  Secure + SameSite=Lax. Refresh endpoint same.
- Required frontend: delete `core-tokens-sync.ts` localStorage manipulation;
  rely on cookies flowing automatically with fetch credentials: 'include'.

## Ownership set (you MAY edit ONLY these)

- `frontend/src/components/kloel/useChatController.ts` + `.spec.ts`
- `frontend/src/lib/api/chat-sessions.ts` (CREATE)
- `frontend/src/hooks/useChatSessions.ts` (CREATE)
- `frontend/src/components/kloel/auth/auth-provider.tsx` + `.spec.tsx`
- `frontend/src/components/kloel/landing/FloatingChat.tsx` + `.helpers.ts`
- `frontend/src/lib/api/core-tokens-sync.ts`
- `backend/src/kloel/chat-session.service.ts` (CREATE or extend)
- `backend/src/kloel/chat-session.controller.ts` (CREATE or extend)
- `backend/src/kloel/chat-session.service.spec.ts`
- `backend/src/auth/auth.controller.ts` — only the onboarding-complete endpoint
- `backend/src/auth/auth.service.ts` — only the onboarding helper
- `backend/src/guest/guest-session.service.ts` (CREATE or verify exists)
- `backend/src/guest/guest-session.controller.ts` (CREATE or verify exists)
- `backend/prisma/schema.prisma` — only add `onboardingCompletedAt` if missing
- `backend/prisma/migrations/<timestamp>_add_onboarding_completed_at/migration.sql` (CREATE if needed)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE FRONTEND + REGRA DE BANCO DE DADOS.
2. `AGENTS.md`.
3. Each target file.
4. `backend/prisma/schema.prisma` — sections User, ChatSession, GuestSession.

## Forbidden moves

- Keep localStorage as fallback "for offline" — frontend talks to backend or
  shows honest empty state, no localStorage as DB.
- Add migrations that drop columns — append only.
- Touch other localStorage usages (UI prefs etc) — those are separate scope.
- Bypass tokens, new `any`.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx prisma validate
npx prisma migrate diff --from-schema-datasource backend/prisma/schema.prisma \
  --to-schema-datamodel backend/prisma/schema.prisma --exit-code  # should be 0 if no schema change needed
npx jest --testPathPattern="chat-session|onboarding|guest-session|auth.controller"

cd ../frontend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/components/kloel/useChatController.ts \
  src/components/kloel/auth/auth-provider.tsx \
  src/components/kloel/landing/FloatingChat.tsx \
  src/components/kloel/landing/FloatingChat.helpers.ts \
  src/lib/api/core-tokens-sync.ts \
  src/lib/api/chat-sessions.ts \
  src/hooks/useChatSessions.ts 2>/dev/null
npx jest --testPathPattern="useChatController|auth-provider|FloatingChat|core-tokens-sync"

cd ..
# Verify zero remaining critical localStorage usage
grep -rn "localStorage" frontend/src --include="*.{ts,tsx}" | \
  grep -v "test\|spec\|theme/ThemeProvider\|sidebar/useSidebarState\|conta/ContaIdiomasSection" | \
  wc -l
```

## Definition of done

- `grep` (above) returns **0**.
- Backend specs cover happy + tenant-isolation for each new endpoint.
- `npx tsc` no regress.
- `npx prisma validate` passes.
- `npx eslint` clean on touched files.
- No bypass tokens, no protected files, no commits.

## Hard stop conditions

- `ChatSession` model doesn't exist in schema.prisma — STOP, report (need
  model creation in separate slice).
- `GuestSession` model doesn't exist — STOP, report.
- httpOnly cookie infrastructure doesn't exist in backend (no
  `passthrough.cookie` config or NestJS cookie-parser middleware) — STOP,
  report (infrastructure prerequisite).
- Frontend uses `apiFetch` from a centralized client — verify; if not, STOP
  and report (refactoring API client out of scope here).

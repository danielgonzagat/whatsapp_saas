# Workspaces · Settings · Team — multi-tenant account, configuration & membership

The single tenant container of KLOEL. A **Workspace** is the multi-tenant root every
other model hangs off (every `workspaceId` foreign key points here). This territory owns
three product capabilities:

1. **Workspace lifecycle** — read the current workspace, delete it (cascades all data).
2. **Settings persistence** — the catch-all `Workspace.providerSettings` JSON blob holds
   account info, notifications, business hours, sales policy, theme, channel toggles,
   anti-ban jitter, and WhatsApp provider selection.
3. **Team membership & roles** — invite people by email, accept invites, list members +
   pending invites, change roles, remove members; guarded so a workspace can never lose
   its last ADMIN.

> Scope note: this doc covers `backend/src/workspaces/` + `backend/src/team/`. **API Keys**
> (`/settings/api-keys`, `backend/src/api-keys/`) and **outgoing Webhooks**
> (`/settings/webhooks`, `backend/src/webhooks/`) are *separate* territories that happen to
> live under the `/settings/*` URL prefix and are consumed from the same frontend Settings
> screen — they are cross-linked, not owned here.

---

## What the user does

- Opens **Settings / "Conta"** (`frontend/src/app/(main)/settings/page.tsx` → `ContaView`).
- Edits account info: workspace name, phone, timezone, language, date format, website,
  notification toggles, webhook URL → **Save**.
- Toggles channels (e.g. enables Email alongside WhatsApp), picks the WhatsApp provider
  (Meta Cloud vs whatsapp-api), and tunes anti-ban send jitter (min/max delay).
- Opens the **"Equipe"** (Team) sub-section: sees current members + pending invites,
  invites a teammate by email with a role (ADMIN/MEMBER/VIEWER), revokes an invite,
  removes a member, or changes a member's role.
- An invited teammate clicks the link in the email, sets name + password, and joins.

---

## End-to-end flow

### A. Read/save account settings (works)

```
ContaView (frontend/src/components/kloel/conta/ContaView.tsx)
  → workspaceApi.updateAccount(payload)            frontend/src/lib/api/workspace.ts:162
  → apiFetch POST /workspace/{id}/account          (no Next proxy — direct to backend)
  → WorkspaceController.setAccount                 backend/src/workspaces/workspace.controller.ts:165 (@Post(':id/account'))
  → WorkspaceService.updateAccountSettings         backend/src/workspaces/workspace.service.ts:226
  → prisma.workspace.update { name, providerSettings }   model Workspace (schema.prisma:119)
  → DB table public."RAC_Workspace"
  → returns updated Workspace → SWR cache invalidated → UI re-renders
```

Reads go through `GET /workspace/{id}/account` → `getAccountSettings` (service:207), which
projects the `providerSettings` JSON into a flat `{ name, phone, timezone, webhookUrl,
website, language, dateFormat, notifications }` shape. `GET /workspace/{id}/settings`
(controller:131) additionally normalizes WhatsApp provider/session status via
`normalizeProviderSettings` (controller:42) and returns `jitterMin/Max`, `customDomain`,
`branding`.

### B. Invite a teammate (backend works; frontend has a contract bug — see Honest status)

```
TeamSection (frontend/src/components/kloel/conta/ContaTeamSection.tsx:46)
  → inviteTeamMember(email, role)                  frontend/src/lib/api/team.ts:56
  → apiFetch POST /team/invite                      (no Next proxy)
  → TeamController.invite                            backend/src/team/team.controller.ts:33 (@Post('invite'), @Roles('ADMIN'))
  → TeamService.inviteMember                         backend/src/team/team.service.ts:62
       · dedupe against existing Agent + Invitation (workspaceId_email unique)
       · create Invitation { token=randomUUID, expiresAt=+7d }   model Invitation (schema.prisma:1271)
       · EmailService.sendTeamInviteEmail → link ${FRONTEND_URL}/invite/accept?token=...
  → DB table public."RAC_Invitation"
```

### C. Accept an invite (backend works; **frontend page is missing** — see gaps)

```
(email link) /invite/accept?token=...   ← NO Next.js route exists for this path
  → would call acceptTeamInvite(token, name, password)   frontend/src/lib/api/team.ts:100
  → apiFetch POST /team/accept-invite
  → TeamController.acceptInvite (@Public)            backend/src/team/team.controller.ts:75
  → TeamService.acceptInvite                          backend/src/team/team.service.ts:119
       · validate token + not expired, password ≥ 8 chars
       · bcrypt-hash password, create Agent { role from invite }   model Agent (schema.prisma:306)
       · delete Invitation
  → DB tables RAC_Agent (insert) + RAC_Invitation (delete)
```

### D. List / change / remove members (backend works)

```
GET  /team            → TeamController.list        → listMembers       → { agents, invitations }
DELETE /team/invite/:id → revokeInvite (ADMIN)      → audit + delete Invitation
DELETE /team/member/:id → removeMember (ADMIN)      → ensureLastAdmin guard + audit + delete Agent
PATCH /team/member/:id/role → updateRole (ADMIN)    → ensureLastAdmin guard + audit + update Agent.role
```

UI states: `ContaTeamSection` handles loading (SWR `isLoading`), empty
(`members.length === 0`), per-row pending state (`removingId`/`revokingId`), and inline
error/success strings (`inviteError`/`inviteSuccess`).

---

## Canonical vocabulary

| Concept | Canonical name | Notes / lingering aliases |
|---|---|---|
| Tenant container | **Workspace** (`Workspace` model, `RAC_Workspace` table) | the multi-tenant root |
| A person in a workspace | **Agent** (`Agent` model, `RAC_Agent` table) | UI calls them "member" / "team member"; API client type is `TeamMember`. **Backend payload key is `agents`, not `members`.** |
| A pending email invite | **Invitation** (`Invitation` model, `RAC_Invitation` table) | UI/API type is `TeamInvite`. **Backend payload key is `invitations`, not `invites`.** |
| Free-form workspace config | **providerSettings** (`Workspace.providerSettings: Json`) | single JSON blob; nested keys: `autopilot`, `autonomy`, `notifications`, `businessHours`, `salesPolicy`, `businessInfo`, `email`, `ui.theme`, `phone`, `timezone`, etc. |
| Roles | **ADMIN / MEMBER / VIEWER** (validated in `InviteMemberDto`/`UpdateRoleDto`) | Prisma comments still say `// ADMIN, AGENT` — stale comment, not enforced. `@Roles('ADMIN')` guards mutations. |
| Workspace settings service | **`WorkspaceService.getSettings`** | canonical alias of `getAccountSettings` for the Kloel capability resolver (service:350) |

---

## Key services & single responsibility

| Service | File | Owns |
|---|---|---|
| `WorkspaceController` | `workspaces/workspace.controller.ts` | thin HTTP layer for `/workspace/*`; resolves+enforces workspaceId via `resolveWorkspaceId`; normalizes WhatsApp provider/session for `/settings` reads. |
| `WorkspaceService` | `workspaces/workspace.service.ts` | the workspace read (cached 30s), delete, and all `providerSettings` mutations: `patchSettings` (autopilot/autonomy-aware merge), `updateAccountSettings`, `updateInfo`, `updateSettings` (deep merge), `setHours`, `setPolicy`, `updateThemePreference`, `setChannels`, `setProvider`, `setJitter`, `setGlobalPriorOptOut`, `toEngineWorkspace` (adapter to the WhatsApp engine). |
| `TeamController` | `team/team.controller.ts` | thin HTTP layer for `/team/*`; ADMIN-guards all mutations; `accept-invite` is `@Public`. |
| `TeamService` | `team/team.service.ts` | invite/accept/revoke/remove/update-role lifecycle; `ensureLastAdmin` invariant; writes AuditLog on destructive ops. |
| `resolveWorkspaceId` | `auth/workspace-access.ts` | shared guard: picks workspaceId (explicit > params > body > query) then asserts it matches the JWT's workspaceId. |

---

## Data & events

**Prisma models owned**

- `Workspace` (`RAC_Workspace`) — `schema.prisma:119`. Scalar config columns: `jitterMin`,
  `jitterMax`, `globalPriorOptOut`, `customDomain` (unique), `branding` (Json),
  `stripeCustomerId`, plus the `providerSettings` Json catch-all. Root of ~50 child relations.
- `Agent` (`RAC_Agent`) — `schema.prisma:306`. A workspace member; also doubles as the auth
  principal (has `password`, OAuth fields, KYC fields). `@@unique([workspaceId, email])`.
- `Invitation` (`RAC_Invitation`) — `schema.prisma:1271`. `token` unique,
  `@@unique([workspaceId, email])`, `expiresAt`, `onDelete: Cascade` from Workspace.

**Events** — this territory emits **no domain/outbox events**. The only side-channels are:
the `AuditLog` write (`RAC_AuditLog`) on revoke/remove/role-change via `AuditService.log`,
and the transactional invite email via `EmailService.sendTeamInviteEmail`. No AsyncAPI
channels are indexed for workspace/team (confirmed: asyncapi filter returns 0).

---

## Workspace isolation

Every read and write is scoped to the caller's workspace:

- `WorkspaceController` resolves the target id with `resolveWorkspaceId(req, id)`
  (`auth/workspace-access.ts:119`). If the `:id` path param differs from the JWT's
  `workspaceId`, it throws **403 Forbidden** (`enforceRequestedMatchesToken`). A missing
  token → **401**. There is a dev-only `AUTH_OPTIONAL` path that is hard-rejected in
  production.
- `TeamController` does not take an id param — it always uses `req.user.workspaceId`
  straight from the JWT, so cross-tenant access is structurally impossible.
- `TeamService` lookups use composite/scoped wheres (`where: { id, workspaceId }`,
  `workspaceId_email`) and re-checks `agent.workspaceId === workspaceId` defensively, so an
  id from another tenant resolves to NotFound rather than leaking.

---

## Honest status

**Works in production (evidence: real Prisma writes, guards, tests present):**

- Account settings read/save round-trip (`updateAccountSettings`/`getAccountSettings`) —
  real `RAC_Workspace` persistence, covered by `workspace.service.spec.ts`.
- Channels toggle, jitter, provider select, theme, business hours (with HH:mm + ordering
  validation), sales policy, business info — all persist into `providerSettings`.
- Team backend end-to-end: invite (with dedupe + 7-day token + email), accept (bcrypt
  Agent creation), revoke, remove, role change — all with `@Roles('ADMIN')` guards,
  `ensureLastAdmin` invariant, and AuditLog trail. Covered by `team.service.spec.ts`,
  `team.service.remove-member.spec.ts`, `team.controller.spec.ts`.
- Multi-tenant isolation is enforced at the controller (id-vs-JWT) and service (scoped
  where) layers.

**Broken / facade / gap (brutally honest):**

1. **Team list renders empty in the UI — real contract mismatch.**
   `TeamService.listMembers` returns `{ agents, invitations }` (team.service.ts:58), and
   the canonical API client `frontend/src/lib/api/team.ts:47` maps that correctly. BUT the
   actual screen `ContaTeamSection.tsx:27-28` bypasses that client, calls
   `swrFetcher('/team')` directly, and reads `data?.members` / `data?.invites` — keys that
   never exist in the response. **Result: the team list and pending-invites list always
   render empty even when members exist.** The `ContaTypes.TeamApiResponse` type
   (`{ members?, invites? }`) encodes the wrong shape.

2. **Invite-accept page is missing.** `inviteMember` emails a link to
   `${FRONTEND_URL}/invite/accept?token=...` and `team.ts` has `acceptTeamInvite()`, but
   there is **no `/invite/accept` route** under `frontend/src/app` (confirmed by find). The
   invite flow dead-ends at a 404 — a teammate cannot actually join via the email link.

3. **`setProvider` ignores the requested provider** (service:161): it normalizes the input
   then falls back to the env default regardless — by design today (provider is largely
   env-driven), but the `provider` argument is effectively cosmetic.

**Not a gap (excluded):** WAHA / `whatsapp-api` provider is intentionally legacy/deprecated
per `docs/adr/0001-whatsapp-source-of-truth.md`; provider plumbing here is not in scope.

---

## Start here

1. `backend/src/team/team.service.ts` — the clearest, fully-real slice of this territory;
   read it to understand membership lifecycle + the last-admin invariant + audit trail.
2. `backend/src/workspaces/workspace.service.ts` — see how every setting funnels into the
   one `providerSettings` JSON blob (`patchSettings`, `updateAccountSettings`, `setHours`).
3. `frontend/src/components/kloel/conta/ContaTeamSection.tsx` vs
   `frontend/src/lib/api/team.ts` — read these two side by side to see the live
   `members`/`agents` contract mismatch (gap #1) that makes the team list look empty.

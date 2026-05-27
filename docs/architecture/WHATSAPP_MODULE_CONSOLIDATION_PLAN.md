# WhatsappModule Consolidation Plan — ADR-0012 OmniCore Wave W3/W4

> **Status:** Investigation complete; execution deferred to a dedicated wave.
> **Author:** Wave 26 subagent B (audit only — no module move performed).
> **Date:** 2026-05-27.
> **Source ADR:** [`docs/adr/0012-kloel-omnicore-channel-unification.md`](../adr/0012-kloel-omnicore-channel-unification.md).
> **Sibling docs:** [`CHANNEL_DISPATCH_CANONICAL.md`](./CHANNEL_DISPATCH_CANONICAL.md), [`CONNECT_CHANNEL_CANONICAL.md`](./CONNECT_CHANNEL_CANONICAL.md).

## TL;DR

`backend/src/whatsapp/whatsapp.module.ts` is the last non-shim file in `backend/src/whatsapp/` that still acts as the canonical `WhatsappModule` for the entire app. The rest of `backend/src/whatsapp/` is either:

- **Already migrated** (all `providers/*.ts` and `provider-settings.types.ts` are 5-line `export * from '../../marketing/channels/whatsapp/...'` deprecation shims), OR
- **CIA test fixtures + specs** that import their target services from `../marketing/channels/whatsapp/...` and stay in place by inertia.

The chosen consolidation strategy is **Strategy A — physically move `whatsapp.module.ts` to `marketing/channels/whatsapp/whatsapp-channel.module.ts`**, then convert the old path into a thin deprecation shim and (after a clean cycle) delete it. This is the exact Wave W3 step prescribed by ADR-0012 §"Plano de migração".

Execution is **deferred** out of this wave because the prompt's risk threshold (`>10 conflicting providers OR complex provider factories`) is exceeded:

- **23 providers** in the module class (5 controllers, 13 exports, 4 `useExisting`/`useFactory` token bindings).
- **5 circular imports** via `forwardRef` (`BillingModule`, `CrmModule`, `KloelModule`, `CiaModule`, `OmnichannelModule`).
- **9 external importers** in app.module / health / meta / kloel / cia / marketing / marketing-channels / mass-send / webhooks. Two of them already use `require('../whatsapp/whatsapp.module').WhatsappModule` to break TypeScript cycles.
- **Concurrent agent activity** on the same folder at the time of audit (staged deletion of 16 `whatsapp/providers/*.ts` shims uncommitted).

A dedicated wave should perform Strategy A as one PR with all 9 importer rewrites in lock-step.

---

## 1. Current state — measured

### 1.1 `backend/src/whatsapp/` folder inventory

| File | Lines | Kind |
|---|---|---|
| `whatsapp.module.ts` | 111 | **canonical module (real DI registrations)** |
| `provider-settings.types.ts` | 5 | deprecation shim → `marketing/channels/whatsapp/provider-settings.types` |
| `providers/provider-env.ts` | 5 | deprecation shim |
| `providers/provider-registry.ts` | 10 | deprecation shim |
| `providers/whatsapp-api.provider.ts` | 5 | deprecation shim |
| `providers/waha.provider.ts` | 7 | deprecation shim |
| `providers/provider-registry.spec.ts` | 335 | **real spec** (re-uses canonical types) |
| `cia-backlog-run.helpers.ts` | 162 | real helper (CIA backlog runner — keeps WhatsApp coupling minimal) |
| `cia-backlog-run.service.spec.ts` | 310 | real spec |
| `cia-bootstrap.constants.ts` | 26 | real constants |
| `cia-bootstrap.service.spec.ts` | 403 | real spec |
| `cia-chat-filter.service.spec.ts` | 311 | real spec |
| `cia-inline-fallback.service.processing.spec.ts` | 336 | real spec |
| `cia-inline-fallback.service.spec.ts` | 461 | real spec |
| `cia-remote-backlog.service.spec.ts` | 395 | real spec |
| `cia-runtime.fixtures.ts` | 48 | real fixture |
| `whatsapp-digits.util.spec.ts` | 66 | real spec |

Total: **2634 LOC** across the folder; only `whatsapp.module.ts` is a Nest module artefact. The CIA helper + spec cluster is in `backend/src/whatsapp/` purely by path inertia and is fully decoupled from this module move — it can be moved in a later wave under a `cia/` regrouping plan.

### 1.2 `whatsapp.module.ts` shape

- **Imports (Nest modules):** `ScheduleModule.forRoot()`, `WorkspaceModule`, `InboxModule`, `ConfigModule`, `forwardRef(() => BillingModule)`, `forwardRef(() => CrmModule)`, `PrismaModule`, `forwardRef(() => KloelModule)` *(via `require` to avoid TS top-level circular)*, `forwardRef(() => CiaModule)` *(via `require`)*, `forwardRef(() => OmnichannelModule)`, `WhatsAppEventEmitterModule`.
- **Controllers (5):** `WhatsAppApiController`, `WhatsAppCatalogController`, `WhatsAppMetaCompatController`, `WhatsappController`, `InternalWhatsAppRuntimeController` — **all already physically under `marketing/channels/whatsapp/controllers/`.**
- **Providers (23):** `WhatsappService`, `WhatsappSessionService`, `WhatsappMessageDispatcherService`, `WhatsappMediaService`, `WhatsappReconcilerService`, `WhatsappSendRateGuardService`, `InboundProcessorService`, `WhatsAppApiProvider`, `WahaProvider`, `WhatsAppProviderRegistry`, `WhatsAppWatchdogService`, `WhatsAppWatchdogRecoveryService`, `WhatsAppWatchdogSessionService`, `WhatsAppCatchupService`, `WhatsappCatchupOrchestratorService`, `WhatsappCatchupHistoryService`, `AgentEventsService`, `AccountAgentService`, `WorkerRuntimeService`, `WhatsappChatMessagesService`, `WhatsappChatBacklogService` + **4 token bindings** (`WHATSAPP_MESSAGING`, `INBOUND_PROCESSOR`, `CIA_RUNTIME`, `CATCHUP_HISTORY`).
- **Exports (13):** `WhatsappService`, `WHATSAPP_MESSAGING`, `InboundProcessorService`, `INBOUND_PROCESSOR`, `CIA_RUNTIME`, `WhatsappCatchupHistoryService`, `WhatsAppCatchupService`, `CATCHUP_HISTORY`, `AgentEventsService`, `AccountAgentService`, `WorkerRuntimeService`, `WhatsAppApiProvider`, `WhatsAppProviderRegistry`.

All 23 providers and 5 controllers are imported in `whatsapp.module.ts` from `../marketing/channels/whatsapp/...` paths today, i.e. the **source-of-truth code is already in `marketing/channels/whatsapp/`**. Only the `@Module()` decorator class itself lives outside.

### 1.3 External importers of `WhatsappModule` (9 sites)

| Importer | Line | Style |
|---|---|---|
| `backend/src/app.module.ts:46` | top-level import + module list | direct `import { WhatsappModule } from './whatsapp/whatsapp.module'` |
| `backend/src/health/health.module.ts:8` | top-level import | direct |
| `backend/src/meta/meta.module.ts:6` | top-level + `forwardRef(() => WhatsappModule)` | direct |
| `backend/src/kloel/kloel.module.ts:207` | `forwardRef(() => require('../whatsapp/whatsapp.module').WhatsappModule)` | **lazy require to break TS cycle** |
| `backend/src/kloel/mind/cia/cia.module.ts:6` | top-level + `forwardRef(() => WhatsappModule)` | direct |
| `backend/src/marketing/marketing.module.ts:5` | top-level import | direct |
| `backend/src/marketing/channels/marketing-channels.module.ts:26` | `forwardRef(() => WhatsappModule)` | direct |
| `backend/src/mass-send/mass-send.module.ts:2` | direct | direct |
| `backend/src/webhooks/webhooks.module.ts:9` | `forwardRef(() => WhatsappModule)` | direct |

Two lazy `require()` sites (kloel.module + whatsapp.module's own `KloelModule`/`CiaModule` use) prove the cycle graph is already non-trivial.

### 1.4 Existing `MarketingChannelsModule` is NOT a substitute

`backend/src/marketing/channels/marketing-channels.module.ts` exists but its scope is the **Wave W1 channel-dispatch adapters** (`WhatsAppDispatchAdapter`, `InstagramDispatchAdapter`, etc.), not the WhatsApp provider DI graph. It imports `WhatsappModule` itself and would create a worse cycle if absorbed.

### 1.5 No `whatsapp-channel.module.ts` (or equivalent) exists yet in `marketing/channels/whatsapp/`

`find marketing/channels/whatsapp -maxdepth 1 -name '*.module.ts'` returns empty.

---

## 2. Strategy decision

### Strategy A — Move file (CHOSEN, deferred)

`git mv backend/src/whatsapp/whatsapp.module.ts backend/src/marketing/channels/whatsapp/whatsapp-channel.module.ts`. Class name remains `WhatsappModule` (preserves all 9 callers semantically); only the file path changes. The old path becomes a 5-line deprecation shim re-exporting from the new path during a 2-week dual-path window.

**Why Strategy A and not B or C:**

- **Strategy B (thin re-export shim in place)** is what the *interim end state* of Strategy A looks like. It does not advance ADR-0012 — it just creates indefinite tech debt without moving the canonical file.
- **Strategy C (delete `whatsapp.module.ts`, absorb into `marketing.module.ts`)** is rejected because:
  1. `MarketingModule` would gain 23 providers + 5 controllers + 5 forwardRef cycles → it would become a 800+ LOC god-module.
  2. `MarketingModule` already imports `WhatsappModule` — merging would create cycles inside the now-merged module.
  3. ADR-0012 §1 explicitly mandates a *per-channel* sub-module topology (`marketing/channels/<channel>/`), not a single fat module. Strategy C contradicts the ADR.

### Strategy A — concrete steps for a future wave

1. **Pre-flight gate.** Verify no concurrent agent is editing `backend/src/whatsapp/` or `backend/src/marketing/channels/whatsapp/`. Run `git status` and abort if any staged or unstaged changes touch either path. The audit found 16 staged deletions of `providers/*.ts` shims in flight at the time of writing — these must land first.

2. **Move the file (one commit).**

   ```sh
   git mv backend/src/whatsapp/whatsapp.module.ts \
          backend/src/marketing/channels/whatsapp/whatsapp-channel.module.ts
   ```

3. **Fix internal imports in the moved file.** All `../marketing/channels/whatsapp/...` becomes `./...`; all `../prisma/...`, `../inbox/...`, etc. become `../../../prisma/...`, `../../../inbox/...`. Specifically:

   - `../billing/billing.module` → `../../../billing/billing.module`
   - `../crm/crm.module` → `../../../crm/crm.module`
   - `../inbox/inbox.module` → `../../../inbox/inbox.module`
   - `../omnichannel/omnichannel.module` → `../../../omnichannel/omnichannel.module`
   - `../prisma/prisma.module` → `../../../prisma/prisma.module`
   - `../workspaces/workspace.module` → `../../../workspaces/workspace.module`
   - `../kloel/whatsapp-emitter/whatsapp-event-emitter.module` → `../../../kloel/whatsapp-emitter/whatsapp-event-emitter.module`
   - `../kloel/kloel.module` (in `require()`) → `../../../kloel/kloel.module`
   - `../kloel/mind/cia/cia.module` (in `require()`) → `../../../kloel/mind/cia/cia.module`
   - `../cia/cia-runtime.service` (in `require()`) → `../../../cia/cia-runtime.service`
   - `../marketing/channels/whatsapp/...` (all 23 lines) → `./...`

4. **Create deprecation shim at the old path** to preserve the 9 callers without diffing them in the same commit:

   ```ts
   /**
    * @deprecated Use 'backend/src/marketing/channels/whatsapp/whatsapp-channel.module' directly.
    *   Per ADR-0012 OmniCore Wave W3.
    */
   export * from '../marketing/channels/whatsapp/whatsapp-channel.module';
   ```

5. **Run gates.**

   ```sh
   cd backend && npm run typecheck
   cd backend && npm test -- --testPathPattern=whatsapp
   cd backend && npx ts-node scripts/canonical/check-canonical-imports.mjs  # if it exists
   ```

6. **Update the 9 callers in a *second* commit** (one per importer or grouped):

   - `app.module.ts`: `./whatsapp/whatsapp.module` → `./marketing/channels/whatsapp/whatsapp-channel.module`
   - `health/health.module.ts`: `../whatsapp/whatsapp.module` → `../marketing/channels/whatsapp/whatsapp-channel.module`
   - `meta/meta.module.ts`: same shape
   - `kloel/kloel.module.ts`: the lazy `require('../whatsapp/whatsapp.module')` → `require('../marketing/channels/whatsapp/whatsapp-channel.module')`
   - `kloel/mind/cia/cia.module.ts`: `../../../whatsapp/whatsapp.module` → `../../channels/whatsapp/whatsapp-channel.module`
   - `marketing/marketing.module.ts`: `../whatsapp/whatsapp.module` → `./channels/whatsapp/whatsapp-channel.module`
   - `marketing/channels/marketing-channels.module.ts`: `../../whatsapp/whatsapp.module` → `./whatsapp/whatsapp-channel.module`
   - `mass-send/mass-send.module.ts`: `../whatsapp/whatsapp.module` → `../marketing/channels/whatsapp/whatsapp-channel.module`
   - `webhooks/webhooks.module.ts`: `../whatsapp/whatsapp.module` → `../marketing/channels/whatsapp/whatsapp-channel.module`

7. **Verify cycle graph.** Both `KloelModule` ↔ `WhatsappModule` and `CiaModule` ↔ `WhatsappModule` are currently broken via lazy `require()`. After the move:
   - Keep the `require()`-based forwardRefs intact (they survive any path change).
   - Re-run `cd backend && npm run start -- --inspect-brk` long enough to see Nest's DI graph initialize without "Nest can't resolve dependencies" errors.

8. **Delete the shim file (Wave W4, separate PR after 2 weeks of green prod).** Replaces `backend/src/whatsapp/whatsapp.module.ts` shim with nothing; folder `backend/src/whatsapp/` shrinks to CIA helpers + specs + provider-registry.spec.ts + provider-settings.types.ts shim. A follow-up wave then handles those.

### Rollback

`git revert` the move commit and the caller-rewrite commit in reverse order. No data, no migrations, no runtime state involved — pure code path change.

---

## 3. Risks observed during audit

| Risk | Mitigation in Strategy A |
|---|---|
| Concurrent agent collides on the same folder | Pre-flight `git status` gate (step 1). Audit found 16 staged deletions in flight at 2026-05-27 18:55 BRT. |
| `kloel.module` uses `require('../whatsapp/whatsapp.module')` to avoid TS resolution cycles | Lazy `require()` survives string-path edits as long as the string matches a resolvable file. Update the string in step 6. |
| `whatsapp.module.ts` itself uses `require('../kloel/kloel.module')`, `require('../kloel/mind/cia/cia.module')`, `require('../cia/cia-runtime.service')` | After move, these three strings need new `../../../...` prefixes (covered in step 3). |
| Five `forwardRef` cycles → DI bootstrap fragility | Move is path-only; class names and `forwardRef(() => ...)` arrow bodies remain identical. Cycle structure is unchanged. |
| `useExisting: require('../cia/cia-runtime.service').CiaRuntimeService` is a runtime late-bind | Path fix in step 3 covers this. The late-bind itself is preserved. |
| 9 caller modules edited in one PR | Group into two commits (move + shim, then callers) so `git bisect` can land precisely. |
| Inbound spec coverage | `cia-*.spec.ts` and `provider-registry.spec.ts` reference the *services* by re-exported paths, not the module class directly. Specs survive without changes. |
| Lint/visual-contract/Codacy gates | None of the protected files are touched. `backend/eslint.config.mjs` and visual-contract scripts have no rules against `marketing/channels/whatsapp/whatsapp-channel.module.ts`. |

---

## 4. Acceptance criteria for the future wave

- [ ] `backend/src/marketing/channels/whatsapp/whatsapp-channel.module.ts` exists and is the canonical `WhatsappModule` source.
- [ ] `backend/src/whatsapp/whatsapp.module.ts` is either deleted or a 5-line deprecation shim.
- [ ] All 9 importers updated; `grep -rEn "WhatsappModule" backend/src --include='*.ts'` shows zero references to the old path (or only the shim itself).
- [ ] `cd backend && npm run typecheck` exits 0.
- [ ] `cd backend && npm test -- --testPathPattern='(whatsapp|cia|marketing)'` is green.
- [ ] `cd backend && npm run start` boots Nest with no "Can't resolve dependencies" or circular-injection warnings.
- [ ] Canonical-imports gate (if exists) is green.
- [ ] No protected file touched. No `--no-verify` used.
- [ ] PR description references this plan and ADR-0012.

---

## 5. Out of scope

- Moving `cia-*.ts` + `cia-*.spec.ts` + `cia-runtime.fixtures.ts` out of `backend/src/whatsapp/`. They are CIA-domain files squatting under `whatsapp/` by inertia and belong in a separate `cia/` regrouping wave.
- Deleting `provider-registry.spec.ts` from `backend/src/whatsapp/providers/`. Will be handled by the same in-flight cleanup wave that's deleting the 16 provider shims.
- Renaming `WhatsappModule` → `WhatsappChannelModule`. The class name change is a separate semver event with no DI value; defer to Wave W5.
- Touching `worker/whatsapp-*.ts`. ADR-0012 §"Não-decisões" puts worker runtime in a later phase.
- Frontend impact. None — the move is backend-internal.

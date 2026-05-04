# CODEX.md — AI CLI Behavioral Standard

> Read by: OpenAI Codex CLI, GitHub Copilot CLI, Gemini CLI, and any AI agent in
> this repo. For Claude Code: see CLAUDE.md. These principles apply IN ADDITION
> to CLAUDE.md. Sources: Karpathy principles, obra/superpowers,
> affaan-m/everything-claude-code.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

---

## KLOEL-Specific Rules

These extend the Karpathy principles for this specific repository:

### Protected Files

Do NOT edit these files. If you need to change them, ask the human:

- `CLAUDE.md`, `AGENTS.md`, `CODEX.md`
- `docs/design/**`, `ops/**`
- `scripts/ops/check-*.mjs`, `.husky/pre-push`
- `backend/eslint.config.mjs`, `frontend/eslint.config.mjs`,
  `worker/eslint.config.mjs`
- `.github/workflows/ci-cd.yml`

### Build Verification

After ANY code change, verify builds:

- Backend: `npm --prefix backend run build`
- Frontend: `npm --prefix frontend run typecheck`
- Worker: `npm --prefix worker run build`

### NestJS DI Safety

- NEVER reorder imports in `backend/src/**/*.ts` — breaks NestJS dependency
  injection
- NEVER touch `*.module.ts` files unless explicitly asked
- After backend changes: run `npm run backend:boot-smoke` to verify DI
  resolution

### Shell Preservation

- NEVER remove existing UI components, pages, tabs, navigation, or visual
  affordances
- Convert fake data to real data — don't remove the UI shell
- If a feature isn't connected yet, show an honest empty state

### Commit Standards

- Use conventional commits: `fix(scope): message`, `feat(scope): message`
- Run `npm run lint` before committing
- Pre-commit hooks (Husky + lint-staged) must pass — never use `--no-verify`

---

## KLOEL Agent Execution Addendum

These rules apply to Codex, Copilot, Gemini, OpenCode, Cursor agents,
Claude-compatible wrappers, and any multi-model CLI.

### Model Capability Routing

Use stronger models for:

- architecture decisions;
- payment/ledger/wallet/split code;
- auth/workspace isolation;
- Prisma schema/migrations;
- NestJS module/DI changes;
- large refactors;
- security-sensitive code;
- debugging unknown production failures.

Use cheaper/weaker models only for:

- summarizing files;
- searching references;
- drafting docs;
- simple mechanical edits;
- test fixture expansion;
- formatting within existing rules.

A weak model must not autonomously modify critical paths.

Critical paths:

- `backend/src/payments/**`
- `backend/src/wallet/**`
- `backend/src/auth/**`
- `backend/src/kyc/**`
- `backend/src/webhooks/**`
- `backend/src/whatsapp/**`
- `backend/src/billing/**`
- `backend/prisma/**`
- `prisma/**`
- `.github/**`
- `ops/**`
- `scripts/ops/**`

### Patch Rules

Before writing a patch:

1. Read the surrounding code.
2. Find existing patterns.
3. Prefer editing existing abstractions over creating parallel ones.
4. Keep public contracts stable.
5. Add or update tests first when behavior changes.
6. Avoid barrel/export churn unless needed.
7. Do not reorder imports in NestJS files.
8. Do not run broad formatters over unrelated files.
9. Do not touch generated files manually.
10. Do not change lockfiles unless dependencies changed.

### Git Preservation Rules

- `git restore` is forbidden for all AI agents in this repository.
- Do not run `git restore`, `git restore --source`, or `git restore --staged`
  for any path, even when a file looks generated or temporary.
- Failed edits must be repaired by editing the code forward, or by restoring
  from an explicit in-memory/file snapshot captured before the edit.
- If a change might need rollback and no safe snapshot exists, stop and ask the
  human. Do not reconstruct state with Git restore.
- `git checkout -- <path>` and `git reset --hard` remain prohibited unless the
  human explicitly asks for that exact destructive operation.

### TypeScript Production Rules

- `any` is forbidden in new code.
- `unknown` must be narrowed before use.
- `as` casts require clear local justification via code structure, not
  comments.
- Avoid non-null assertions `!`; prove existence.
- Prefer discriminated unions for state machines.
- Money must never be `number`.
- Date/time boundaries must be explicit.
- External API payloads must be parsed/validated at boundary.
- Public exported functions need explicit return types.
- Avoid giant object literals without named types.

### NestJS Rules

- Controllers orchestrate; services own business logic.
- Modules are touched only when necessary.
- Do not create circular dependencies.
- Prefer dependency injection over direct instantiation.
- Do not instantiate services manually in production code.
- Validate DTOs.
- Use guards for auth/workspace access.
- Use `Logger` with context, not `console.log`.
- Handle provider errors explicitly.
- After DI/module changes, run backend boot smoke.

### Prisma Rules

- No new `prismaAny`.
- No raw SQL unless unavoidable and reviewed.
- Every query for workspace-owned data must filter by `workspaceId`.
- Use `select` to avoid overfetching sensitive fields.
- Use transactions for multi-write operations.
- Add unique constraints for idempotency.
- Do not mutate immutable financial records.
- Migrations must be deterministic and reviewable.
- Never use destructive migration shortcuts to make tests pass.

### React / Next.js Rules

- Use existing API layer.
- Use existing design tokens/components.
- Server/client boundary must be intentional.
- No business data in localStorage.
- No fake metrics.
- No hidden dead buttons.
- Use accessible labels for controls.
- Loading, error, empty and success states are required.
- Avoid large client components when server rendering is possible.
- Do not introduce a new state library without explicit approval.

### SWR / API Client Rules

- API functions live in the domain module under `frontend/src/lib/api/`.
- Hooks live close to existing domain hook patterns.
- Use `apiFetch` and `swrFetcher`.
- Mutations must revalidate affected keys.
- Error states must surface backend messages safely.
- Do not duplicate API URL construction.
- Do not call backend host directly from components when proxy/api layer
  exists.

### Testing Rules

For bug fixes:

1. Add a failing regression test when feasible.
2. Fix the bug.
3. Prove the test passes.

For new behavior:

1. Test success path.
2. Test validation failure.
3. Test authorization/workspace isolation when applicable.
4. Test idempotency for webhooks/events/payments.
5. Test empty/error states in frontend when practical.

Do not delete tests to make suite green.

### E2E Rules

Use Playwright or equivalent when the task affects:

- login/signup;
- checkout;
- finance/wallet/payout;
- WhatsApp connection;
- chat/inbox/autopilot;
- settings persistence;
- product creation;
- affiliate/partnership invite;
- site/builder publishing.

At minimum, document the manual E2E path if automation is not yet available.

### Security Rules

Before final output, check:

- no secrets;
- no auth bypass;
- no workspace data leak;
- no SQL injection/raw unsafe query;
- no XSS via raw HTML;
- no unsafe redirect;
- no path traversal;
- no public endpoint without rate limiting when needed;
- no sensitive payload in logs;
- no production token in tests.

### Dependency Rules

Before adding a dependency:

1. Check if repo already has a package that solves it.
2. Check package health.
3. Prefer official SDKs for providers.
4. Avoid dependencies for tiny utilities.
5. Update lockfile.
6. Mention why dependency is necessary.

Never add a dependency just because it makes a small task easier.

### Final Answer Contract

When finishing, always include:

```md
Implemented:

- ...

Verified:

- command/result

Not verified:

- ...

Risks:

- ...

Next:

- ...
```

If no validation was run, say exactly why.

For detailed operational workflow, read `docs/ai/AGENT_RUNBOOK.md`.

---

## 5. Research Before Writing (everything-claude-code)

**Search for existing solutions before writing new code.**

- Search GitHub (`gh search code`) for implementations before writing from
  scratch
- Check npm/package registries for battle-tested libraries before hand-rolling
- Prefer adopting proven approaches over writing net-new code
- Use official docs (Context7, vendor docs) to confirm API behavior

## 6. Test-Driven Development (superpowers + everything-claude-code)

**Write tests first. Always.**

Mandatory workflow for features and bug fixes:

1. Write test first (RED) — it should FAIL
2. Write minimal implementation (GREEN) — make it pass
3. Refactor (IMPROVE) — clean up while tests stay green
4. Verify coverage — target 80%+

Test structure: Arrange-Act-Assert (AAA) pattern.

## 7. Immutability (everything-claude-code)

**Create new objects, never mutate existing ones.**

- Return new copies with changes, don't modify in-place
- Prevents hidden side effects and enables safe concurrency
- Especially critical in React state and Redux

## 8. TypeScript Strictness (everything-claude-code)

**No `any`. Ever.**

- Use `unknown` for external/untrusted input, then narrow safely
- Use generics when type depends on caller
- Use `instanceof`, `typeof`, or type guards to narrow
- Exported functions MUST have explicit parameter and return types
- Let TypeScript infer obvious local variable types

## 9. File Organization (everything-claude-code)

**Many small files > few large files.**

- 200-400 lines typical, 800 max
- High cohesion, low coupling
- Organize by feature/domain, not by type
- Extract utilities from large modules

## 10. Security Checklist (everything-claude-code)

Before ANY commit:

- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated at system boundaries
- SQL injection prevention (parameterized queries / Prisma)
- XSS prevention (sanitized HTML, no raw innerHTML)
- Rate limiting on public endpoints
- Error messages don't leak sensitive data
- Timing-safe comparisons for secrets (`crypto.timingSafeEqual`)
- Path traversal prevention for file operations

## 11. Web Performance (everything-claude-code)

Core Web Vitals targets:

- LCP < 2.5s, INP < 200ms, CLS < 0.1
- JS budget: < 300kb gzipped per app page
- Images: explicit width/height, lazy loading below fold
- Fonts: max 2 families, `font-display: swap`
- Dynamic import for heavy libraries

## 12. Verification Before Completion (superpowers)

**Never claim work is done without evidence.**

Before saying "done", "fixed", or "complete":

1. Run the relevant build command and show output
2. Run tests and show pass/fail
3. Verify the specific success criteria defined at start
4. Check for regressions in related features

"It should work" is not evidence. Show the output.

---

## 13. Stripe Migration (active mandate)

KLOEL is migrating ALL payment infrastructure from Asaas + Mercado Pago to
**Stripe Connect Marketplace Model with Custom Accounts**. This is an active
multi-phase mandate authorized by the repo owner on 2026-04-17.

**Founding ADR**:
[docs/adr/0003-stripe-connect-marketplace-model.md](docs/adr/0003-stripe-connect-marketplace-model.md).
**Executable plan (read before touching any payment code)**:
[docs/plans/STRIPE_MIGRATION_PLAN.md](docs/plans/STRIPE_MIGRATION_PLAN.md).

### Non-negotiable rules for any agent touching payment code

1. **Money in `bigint` cents always**. Never `number`. Stripe rejects
   float-rounding errors in splits.
2. **Coverage ≥ 95% in SplitEngine, LedgerEngine, FraudEngine**. Bug here = real
   loss + legal exposure.
3. **Idempotent webhooks**. The `WebhookEvent` table with
   `@@unique([provider, externalId])` stays. Re-delivered webhooks must be
   no-ops.
4. **Immutable ledger**. `LedgerEntry` rows are never UPDATEd. Corrections add a
   new ADJUSTMENT entry.
5. **Preserve the UX shell** (CLAUDE.md master rule). Migration replaces the
   engine under the hood; visible checkout UX stays.
6. **Test keys in dev, live keys only in production via Railway secret
   manager**. `sk_live_*` never appears in tests, .env files, screenshots, or
   chat.
7. **ADR-driven**. Any deviation from the plan requires a new ADR. No
   improvisation. If you discover a constraint that invalidates ADR 0003, stop
   and report.
8. **Phase gates**. Don't skip phases. Each phase has criteria-of-done in the
   plan. Don't mark complete without evidence (commit hash, test output).

### Where each piece will live (target tree)

```
backend/src/payments/
  ├── split/             # FASE 1: pure SplitEngine (no Prisma, no Stripe deps)
  ├── ledger/            # FASE 2: dual-balance + maturation
  ├── connect/           # FASE 3: Custom Account creation + KYC custom UI backend
  ├── fraud/             # FASE 5: pre-PaymentIntent fraud evaluation
  └── providers/         # FASE 6: PaymentProvider interface + Stripe / Asaas-Legacy adapters
backend/src/wallet/      # FASE 4: prepaid credits for API/AI/WhatsApp usage
backend/src/billing/stripe.service.ts  # FASE 0: single SDK wrapper (apiVersion pinned)
```

### How to resume the work (any agent, any session)

1. Read `docs/plans/STRIPE_MIGRATION_PLAN.md` top to bottom.
2. Find the next phase with `[ ]` items in "Critérios de pronto".
3. Verify prerequisites (prior phase entregáveis are `[x]`).
4. If PULSE or tests of prior phase are red, stop and report. Do not skip.
5. On completion, mark `[x]` with evidence (commit hash, test output, PR link).
6. Re-read this file periodically. Treat it as durable instruction, not chat
   history.

## PULSE Auditor Immutability

`scripts/pulse/no-hardcoded-reality-audit.ts` is a locked PULSE governance
surface.

Codex and every other AI CLI are forbidden to edit, weaken, bypass, rename,
delete, chmod, unflag, move, or replace this auditor.

The auditor must keep scanning every source file inside `scripts/pulse/**` and
must preserve hardcode debt when hardcode is deleted without a dynamic
production replacement, including accumulated Git history debt.

If the auditor itself needs to change, stop. The human owner must perform that
change outside autonomous AI execution.

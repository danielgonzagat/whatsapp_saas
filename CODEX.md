# CODEX.md — AI CLI Behavioral Standard

> Read by: OpenAI Codex CLI, GitHub Copilot CLI, Gemini CLI, and any AI agent in this repo.
> For Claude Code: see CLAUDE.md. These principles apply IN ADDITION to CLAUDE.md.
> Sources: Karpathy principles, obra/superpowers, affaan-m/everything-claude-code.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

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

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

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

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant
clarification.

---

## KLOEL-Specific Rules

These extend the Karpathy principles for this specific repository:

### Protected Files

Do NOT edit these files. If you need to change them, ask the human:

- `CLAUDE.md`, `AGENTS.md`, `CODEX.md`
- `docs/design/**`, `ops/**`
- `scripts/ops/check-*.mjs`, `.husky/pre-push`
- `backend/eslint.config.mjs`, `frontend/eslint.config.mjs`, `worker/eslint.config.mjs`
- `.github/workflows/ci-cd.yml`

### Build Verification

After ANY code change, verify builds:

- Backend: `npm --prefix backend run build`
- Frontend: `npm --prefix frontend run typecheck`
- Worker: `npm --prefix worker run build`

### NestJS DI Safety

- NEVER reorder imports in `backend/src/**/*.ts` — breaks NestJS dependency injection
- NEVER touch `*.module.ts` files unless explicitly asked
- After backend changes: run `npm run backend:boot-smoke` to verify DI resolution

### Shell Preservation

- NEVER remove existing UI components, pages, tabs, navigation, or visual affordances
- Convert fake data to real data — don't remove the UI shell
- If a feature isn't connected yet, show an honest empty state

### Commit Standards

- Use conventional commits: `fix(scope): message`, `feat(scope): message`
- Run `npm run lint` before committing
- Pre-commit hooks (Husky + lint-staged) must pass — never use `--no-verify`

---

## 5. Research Before Writing (everything-claude-code)

**Search for existing solutions before writing new code.**

- Search GitHub (`gh search code`) for implementations before writing from scratch
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

KLOEL is migrating ALL payment infrastructure from Asaas + Mercado Pago to **Stripe Connect Platform
Model with Custom Accounts**. This is an active multi-phase mandate authorized by the repo owner on
2026-04-17.

**Founding ADR**:
[docs/adr/0003-stripe-connect-platform-model.md](docs/adr/0003-stripe-connect-platform-model.md).
**Executable plan (read before touching any payment code)**:
[docs/plans/STRIPE_MIGRATION_PLAN.md](docs/plans/STRIPE_MIGRATION_PLAN.md).

### Non-negotiable rules for any agent touching payment code

1. **Money in `bigint` cents always**. Never `number`. Stripe rejects float-rounding errors in
   splits.
2. **Coverage ≥ 95% in SplitEngine, LedgerEngine, FraudEngine**. Bug here = real loss + legal
   exposure.
3. **Idempotent webhooks**. The `WebhookEvent` table with `@@unique([provider, externalId])` stays.
   Re-delivered webhooks must be no-ops.
4. **Immutable ledger**. `LedgerEntry` rows are never UPDATEd. Corrections add a new ADJUSTMENT
   entry.
5. **Preserve the UX shell** (CLAUDE.md master rule). Migration replaces the engine under the hood;
   visible checkout UX stays.
6. **Test keys in dev, live keys only in production via Railway secret manager**. `sk_live_*` never
   appears in tests, .env files, screenshots, or chat.
7. **ADR-driven**. Any deviation from the plan requires a new ADR. No improvisation. If you discover
   a constraint that invalidates ADR 0003, stop and report.
8. **Phase gates**. Don't skip phases. Each phase has criteria-of-done in the plan. Don't mark
   complete without evidence (commit hash, test output).

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
6. Re-read this file periodically. Treat it as durable instruction, not chat history.

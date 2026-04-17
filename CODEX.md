# CODEX.md — AI CLI Behavioral Guidelines (Karpathy Principles)

> Read by: OpenAI Codex CLI, GitHub Copilot CLI, and any AI agent operating in this repo.
> For Claude Code: see CLAUDE.md. These principles apply IN ADDITION to CLAUDE.md.
> Derived from Andrej Karpathy's observations on LLM coding pitfalls.

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

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

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

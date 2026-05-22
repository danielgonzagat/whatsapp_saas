# OpenCode Subagent Delegation Rules — Cognitive Organism Mission

These rules are **mandatory** for every OpenCode subagent dispatched against
the Kloel Cognitive Organism mission (any UTP from Onda 1 onward).

These rules are the **sister document** to
`scripts/decomp/opencode-subagent-delegation-rules.md` (PULSE auditor debt
rules). Both apply when relevant; this one is **authority** for cognitive
organism work.

## 1. Mandatory pre-read

Before doing any work, every OpenCode subagent dispatched on a cognitive
organism UTP MUST read, in order:

1. `docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md` — full canonical plan
2. `docs/contracts/pci/MANIFEST.md` — PCI manifest
3. The PCI document(s) relevant to its UTP (taxonomy / ABI / genesis-lineage /
   gates / conventions / B17 surfaces)
4. The UTP brief in its dispatch prompt (ID, contract, gates, R-criteria)
5. `CLAUDE.md` — project laws (autonomy, Codacy MAX-RIGOR LOCK, protected
   files, anti-gambiarra, evidence)

If any of these files is missing or shows a checksum mismatch (`shasum -a 256
-c docs/contracts/pci/CHECKSUMS.txt`), STOP and report the integrity failure
instead of guessing.

## 2. Absolute prohibitions

### 2.1 No touch on protected files

The following files/dirs MAY NOT be edited under any circumstance:

- `CLAUDE.md`, `AGENTS.md`
- `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md`,
  `docs/design/KLOEL_ANTI_HARDCODE_CONTRACT.md`
- `ops/*.json`, `ops/kloel-design-tokens.json`
- `scripts/ops/check-*.mjs`, `scripts/ops/lib/*.mjs`
- `.husky/pre-push`, `.github/workflows/ci-cd.yml`
- `backend/eslint.config.mjs`, `frontend/eslint.config.mjs`,
  `worker/eslint.config.mjs`
- `backend/src/lib/ai-models.ts`
- `scripts/pulse/no-hardcoded-reality-audit.ts` (PULSE governance)
- `docs/contracts/pci/**` (PCI is frozen — only steward bumps)
- `docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md` (canonical mission)
- `scripts/decomp/cognitive-organism-subagent-delegation-rules.md` (this file)
- `scripts/decomp/opencode-subagent-delegation-rules.md`

Tentar editar = falha automática. Subagent é re-despachado com rebriefing.

### 2.2 No frontend or HTTP contract changes

A cognitive organism UTP MAY NOT:

- Edit anything under `frontend/**`, `frontend-admin/**`, or `e2e/**`
- Edit `*.tsx`, `*.vue`, `*.svelte`, `*.html` files in any location
- Add, remove, rename, or change the response shape of any existing HTTP
  controller / route / DTO
- Edit Tailwind config, CSS modules, design tokens, or any visual asset

If a UTP requires a new HTTP endpoint to be observable from the outside, that
endpoint MUST be **additive** (new path), MUST have no impact on existing
clients, and MUST be reviewed by the orchestrator before merge.

### 2.3 No bypass of Codacy MAX-RIGOR LOCK

These are forbidden everywhere in the diff:

- `biome-ignore`, `nosemgrep`, `eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, `@ts-nocheck`, `codacy:disable`, `codacy:ignore`,
  `NOSONAR`, `noqa`
- Commit message tags: `[codacy skip]`, `[skip codacy]`, `[ci skip]`,
  `[skip ci]`
- `--no-verify`, `--no-gpg-sign`

If a Codacy rule fires, fix the underlying code. Never silence the rule.

### 2.4 No git restore

`git restore <path>` is FORBIDDEN. Period. No flags, no scripts, no
codemods. If something needs reverting, propose a code edit; if reverting is
the only option, STOP and ask the orchestrator.

### 2.5 No PCI divergence

Subagent MAY NOT invent:

- Event names outside `docs/contracts/pci/01-event-taxonomy.md`
- ABI fields outside `docs/contracts/pci/02-abi-schema.md`
- Gate names outside `docs/contracts/pci/04-pulse-gates.md`
- truthMode / valence / audience values outside
  `docs/contracts/pci/05-universal-conventions.md`
- New surface or new surface event outside
  `docs/contracts/pci/06-b17-surfaces.md`

Divergence is detected by `node scripts/pci/validate.mjs --strict`. Any
violation rejects the UTP delivery.

### 2.6 No `prismaAny.<model>.<...>` in new code

Use typed `this.prisma.<model>.<...>` always. Existing `prismaAny` usage may
remain untouched, but any new line of code MUST be typed.

### 2.7 No `Math.random()` / `localStorage` / hardcoded fake data in
production paths

Per CLAUDE.md anti-pattern rules. Use empty/setup/honest states instead.

## 3. Scope rules

### 3.1 Single-UTP discipline

Each subagent owns **one** UTP. The dispatch prompt names it explicitly. The
subagent MAY NOT:

- Touch files outside the editable set declared in the UTP brief
- Adopt adjacent UTPs that "look easy" while at it
- Refactor unrelated code "for cleanliness"
- Bump dependencies "while it's open"

### 3.2 Editable set must be enumerated

The dispatch prompt names every directory the subagent may edit. Anything
outside is read-only. If the subagent needs to read a file outside the
editable set, that's allowed; if it needs to edit, STOP and report.

### 3.3 Adjacent capability inventory

Every dispatch prompt provides a short inventory of adjacent capabilities
(file paths only, no copied code). Subagent MUST consult this inventory
before implementing — to avoid reimplementing what's already present.

## 4. Launch mode

- OpenCode subagents MUST be launched **interactively** through a live
  session (`opencode run -m deepseek/deepseek-v4-pro --variant max ...`).
- Background mode is FORBIDDEN. No `nohup`, no `&`, no detached spawn, no
  `run_in_background: true` from the orchestrator.
- Concurrency cap: **≤8 simultaneous subagents** due to OpenCode SQLite
  boot-window collisions on this machine. Memory `feedback_opencode_sqlite_boot_window`
  is authority.
- Stagger fleet launches by ≥8 seconds when conc > 4 to reduce boot-window
  contention.
- `timeoutSec: 0` in fleet manifests so subagents run to completion.

## 5. Required validation by every UTP

Before declaring its work complete, the subagent MUST:

1. Run `node scripts/pci/validate.mjs --strict` — exit code 0 required
2. Run typecheck on the affected package(s):
   - Backend: `cd backend && npx tsc --noEmit`
   - Worker: `cd worker && npx tsc --noEmit`
3. Run lint on the affected package(s):
   - Backend: `cd backend && npm run lint`
   - Worker: `cd worker && npm run lint`
4. Run the contract spec(s) it created (`*-contract.spec.ts` for the UTP)
5. If the UTP touches PULSE gates, run the relevant gate spec
6. If the UTP emits events, run a smoke test that emits one event and
   reads it back from the spine
7. Run the boot smoke for the affected NestJS app(s) when applicable

If any step fails, the subagent STOPS, reports exact failure, and does not
declare success.

## 6. Required deliverables per UTP

Every UTP delivery MUST include:

1. The implementation files (in the editable set)
2. A `*-contract.spec` test file proving the contract from the UTP brief
3. A short `EXIT.md` (or stdout `EXIT <utp-id>` block) reporting:
   - Files added / modified
   - Gates that PASS / FAIL after the change
   - Validation commands run + exit codes
   - Adjacency conflicts found (or "none")
   - PCI divergences found (or "none")
   - Open follow-ups for the orchestrator (or "none")

## 7. Hardening contract (orchestrator-side, mandatory per memory `feedback_subagent_delivery_must_be_hardened`)

After the subagent reports `EXIT <utp-id>`, the **orchestrator** (Claude /
human) MUST:

1. Read every file the subagent added or modified, line by line
2. Re-run all validation commands the subagent claims to have passed
3. Polish, fix, simplify, and complete any rough edges
4. Verify gates are actually green (not just `log_only` PASS by absence)
5. Verify the contract spec is testing the contract, not a tautology
6. Stage, write a commit message that names the UTP, and commit

If hardening reveals the subagent's work is incomplete, dispatch a follow-up
or do the remaining work in the orchestrator session. **Do not promote a UTP
to `operational` based on subagent self-report alone.**

## 8. Failure protocol

If the subagent cannot complete its UTP:

- Report the blocker exactly (no vague "stuck")
- Report partial work (commit nothing, but show the diff)
- Do NOT use `git restore` to "clean up"
- Do NOT delete files to "make it look done"
- Do NOT mute Codacy/eslint/typecheck

The orchestrator decides whether to: re-dispatch with adjusted brief,
escalate to human, or split the UTP into smaller pieces.

## 9. Specifically forbidden patterns

Borrowed from prior incident reports in memory:

- **"Try again with @ts-ignore"** when a type error appears — fix the type
- **"Wrap in try/catch and swallow"** when an error is unexpected —
  understand and propagate
- **"Fall back to mock"** when an external integration fails — return an
  honest error or setup-required state
- **"Edit AGENTS.md / CLAUDE.md to make the rule simpler"** — rule is
  protected; you change behavior, not the rule
- **"Bump the maxLines in architecture-allowlist"** — decompose the file
  instead

## 10. Anti-anthropomorphism

In code and comments:

- DON'T write `// the agent feels uncertain`. DO write
  `// confidence below threshold — emit `cognition.surprise_observed``.
- DON'T write `// Kloel wants to recover the conversation`. DO write
  `// goal_field promoted goal: re-engage silent lead within window`.
- DON'T add docstrings that say "the AI thinks". DO say "model output
  classified as X with confidence Y".

B13 + B15 are absolute.

---

**Last updated**: 2026-05-13 (Onda 0 closure)

**Authority**: Steward (Daniel Penin). Subagent may NOT modify this file.

# kloel-atomic-edit MCP server (v4)

Closes the **Line-Oriented Action Bottleneck**: built-in coding-agent editors
operate at line/block/hunk granularity, so microscopic intentions become
macroscopic patches — noise, artificial conflicts, drift, blind edits, review
cost. This server adds a **structured action space** (read + atomic edit) as
first-class MCP tools, loaded every session via `.mcp.json`. The model is
unchanged; the *system's* action space is upgraded at exactly the layer the
research identifies as defective.

## Grounding in the literature

| Source | Lesson applied here |
|---|---|
| **CodeStruct** (Amazon, arXiv 2604.05407) | `readCode`/`editCode` over named AST entities. Ablation: removing the READ primitive costs −7.8pp Pass@1 and 7.8× more brittle `str_replace`; removing structured edit costs +38.7%. → `code_browse/outline/read_symbol` + `atomic_edit_symbol`. |
| **To Diff or Not to Diff?** (arXiv 2604.27296) | Block-level rewrites of syntactically coherent units beat fragile offsets. → symbol-scoped replace/insert/remove. |
| **Aider edit-format study** | Edit format materially changes model output (lazy-coding 3×, pass 26%→61%). → strict pre-write validation + preview. |
| **Diff-XYZ / Kiro** | Fragile line offsets bad; semantic rename must come from the language service, not LLM text guessing. → `atomic_rename_symbol_cross_file` via tsconfig. |

## Tools (25)

**Read (address by name, not line guess):**
- `code_browse` — structured directory listing
- `code_outline` — file → signature map (no bodies; token-cheap)
- `code_read_symbol` — scoped selector → full unit + exact range

**Edit (every mutating op: syntax-regression check → atomic write; `preview:true` = dry-run diff; optional `expectedSha256` = optimistic-concurrency guard):**
- **`atomic_replace_text`** — verbatim `oldText`→`newText`, builtin-`edit` ergonomics (no coordinates) + full validation. **Prefer over builtin `edit` for any multi-line/block change.**
- `atomic_replace_range` / `atomic_insert_at` / `atomic_delete_range`
- `atomic_apply_edits` — LSP `TextEdit[]`, N sites = one all-or-nothing intention
- `atomic_replace_literal` — swap a literal selected via the AST, by value
- `atomic_edit_symbol` — `replace` | `insert_after` | `remove` a named AST entity
- `atomic_rename_symbol` — scope-correct rename, single file
- `atomic_rename_symbol_cross_file` — project-wide scope-correct rename (tsconfig language service), all-or-nothing
- `atomic_add_import` / `atomic_remove_import` — named imports, deduped, comma-safe
- `atomic_replace_property_value` — replace an object property's value, optionally scoped to a symbol

**Product-oriented operating layer (turn the principle into CLI behavior):**
- `product_intent_contract` — plain-language goal -> named integration, risk,
  acceptance criteria, behavior proof plan, and next atomic action
- `zero_code_trust_score` — computes whether Daniel can validate by product,
  explanation, code review, technical interpretation, or manual fix
- `behavior_receipt` — founder-facing "what changed / where to test / what was
  proven / what is not proven" receipt
- `truth_receipt` — anti-facade classifier: `REAL`, `PARTIAL`, `STUB`,
  `MOCK_ONLY`, `EXTERNAL_BLOCKED`, `UNPROVEN`, `BROKEN`
- `continuity_status` — reads progress/workboard/PULSE/runtime evidence/locks
  so a fresh session resumes from repo state
- `atomic_lock_acquire` / `atomic_lock_status` / `atomic_lock_release` —
  POSIX `mkdir` front locks under `.atomic-edit-locks/` for real multi-agent
  coordination; status reads both JSON locks and legacy `key=value` locks

## Guarantees the blunt editors do not give

1. **No syntax regression** — TS/JS/JSON reparsed before write; an edit that
   *introduces* a new syntax error is refused (pre-existing errors tolerated:
   surgical, never "make it worse").
2. **Atomic durable write** — temp + `fsync` + `rename`; no torn files.
3. **All-or-nothing** for batched edits and cross-file rename.
4. **Preview** — dry-run any mutation, get the validated diff, write nothing.
5. **Repo containment** + **governance guard** — paths escaping the repo, or
   files protected in `CLAUDE.md`, are hard-refused (adds safety vs. builtins).
6. **Expansion-Factor metric** — `intentionChars` vs `lineRewriteSurfaceChars`
   reported, making the thesis measurable at runtime.

## Verify (real evidence)

```sh
npx tsx scripts/mcp/atomic-edit/smoke.ts
# 83 passed, 0 failed — engine + live MCP stdio round-trip (25 tools)
#   + preview dry-run + cross-file rename via real tsconfig
#   + sha256 concurrency guard + import/property ops
#   + governance-guard refusal of CLAUDE.md
#   + product intent / trust / behavior / truth / continuity / lock tools

node scripts/mcp/atomic-edit/smoke.mjs
# 83 passed, 0 failed — production launcher/dist path

node scripts/mcp/atomic-edit/audit-atomicity.mjs --json
# pass=true, atomic_edit_ratio=1, fallback_rate=0, coarse_unjustified=0
```

## Runtime

No tsx / no npx / no network. The launcher compiles the server graph once to
`dist/` with the already-installed `typescript` (`build.mjs`) and runs plain
`node dist/server.js` (sub-second cold start). It self-rebuilds **only** when a
source `.ts` is newer than `dist/server.js`, so it always reflects the latest
source with no manual build step. `dist/` is gitignored (regenerable).

## Activation across sessions & tools

- **Codex CLI:** registered globally in `~/.codex/config.toml` as
  `[mcp_servers.atomic-edit]`, pointing at
  `scripts/mcp/atomic-edit-mcp-launcher.sh`.
- **Claude Code:** registered in `.mcp.json` as `atomic-edit` (committed). New
  project MCP server needs one-time trust approval on next session start.
- **OpenCode (all agents + subagents):** registered in project `opencode.json`
  and global `~/.config/opencode/opencode.json`; the operating rule is in
  global `~/.config/opencode/AGENTS.md` and the `instructions` key, so every
  CLI model run via OpenCode (incl. the fleet's `opencode run` subagents)
  loads the tools and the prefer-atomic standard automatically. Verified:
  `opencode mcp list` → `✓ atomic-edit connected`.

Operating guidance: `docs/ai/ATOMIC_EDIT_OPERATING_GUIDE.md`.

## Honest scope

- Cross-file rename requires a reachable `tsconfig.json`; falls back to a
  directory-scoped project if none is found.
- Non-TS/JS/JSON files: range/insert/delete work; validation degrades to
  range-validity only (no universal parser).
- Selector-based AST replacement covers named declarations
  (function/class/method/interface/type/var); arbitrary sub-expression
  selectors are a documented future layer, not silently faked.
- Product-layer tools do not magically finish integrations. They force every
  CLI using this MCP to name the product behavior, reject facade/stub claims,
  demand runtime/API/DB/browser evidence, emit a no-code receipt, and resume
  from repository state. A delivery reaches Zero-Code Trust 100 only when
  behavior is actually validated by the product.

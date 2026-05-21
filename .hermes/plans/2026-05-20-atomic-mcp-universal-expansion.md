# Atomic MCP Universal Expansion Plan

> **Goal:** Expand Atomic MCP to cover ALL programming languages with full semantic operations, all 25+ operation topologies from the Atomic Action Principle, and universal validation — making Atomic OS superior to normal CLI agents in every measurable dimension.

**Architecture:** Add multi-language AST backends (tree-sitter via Python subprocess), language-agnostic semantic operators, new topology operations, and enhanced proof/trace/lock infrastructure. Kernel stays fixed (guard, trace, atomicity); policy becomes dynamic.

**Tech Stack:** TypeScript (existing MCP server), Python (tree-sitter bindings for all languages), ts-morph (existing TS), node:child_process (Python bridge)

---

## Phase 1: Multi-Language Validation Engine

### Task 1: Add Python real syntax validation
- Create `engine-python.ts` — spawn Python subprocess to parse via `ast.parse()` 
- Wire into validate() — `.py` files get real syntax errors, not just structural balance
- Test: create a .py file with syntax error, verify engine catches it

### Task 2: Add Python subprocess bridge
- Create `lang-bridge.ts` — typed interface for spawning language-specific validators
- Support: Python (ast), Go (go/parser), Rust (syn via cargo script), Ruby (ripper)
- Fallback gracefully to structural balance when interpreter not installed

### Task 3: Add Go/Rust/Java/C syntax validation via tree-sitter
- Create Python helper script `lang-validate.py` using tree-sitter
- Support: .go, .rs, .java, .kt, .c, .cpp, .h, .cs, .rb, .swift, .scala
- Wire through validate() for all structural-only extensions

## Phase 2: Language-Agnostic Semantic Operations  

### Task 4: Universal rename_symbol via tree-sitter
- Extend `renameSymbol()` past TS-only with tree-sitter scope analysis
- Support: Python, Go, Rust (namespaces/scope tracking)
- For languages without full scope analysis: identifier-based rename with user confirmation

### Task 5: Universal replace_literal 
- Extend `replaceLiteral()` past TS-only
- Use tree-sitter query to find string/number/boolean literals in any language
- Return matched locations for disambiguation

### Task 6: Universal replace_property_value + rename_property_key
- Extend property ops past TS-only using tree-sitter object patterns
- Support: Python dict, Go struct, Rust struct, JSON, YAML, TOML
- Fallback: regex-based property matching with structural validation

## Phase 3: New Operation Topologies

### Task 7: replace_callee_keep_args
- New operation: change function/method name, preserve all arguments
- Language-agnostic: match call pattern, swap identifier before parentheses

### Task 8: replace_arg_keep_callee / insert_arg / remove_arg
- Operations for call argument manipulation
- Insert at position, remove by index, replace by index

### Task 9: wrap_expression / unwrap_expression
- Extend existing `wrapRange()` with expression-level wrapping
- Support: wrap in function call, wrap in conditional, wrap in try/catch

### Task 10: move_symbol_to_module (cross-file extract)
- Extract a symbol (function/class/method) from one file to another
- Update imports in source, add import in destination
- Preserve body hash to prove identity

### Task 11: reorder_imports / reorder_list_items
- Sort/order operations for imports, array items, enum members
- Show as movement, not deletion+creation

### Task 12: replace_operator / replace_decorator
- Replace binary/logical operator preserving operands
- Replace decorator/annotation preserving decorated target

## Phase 4: Enhanced Proof, Trace, and Product Integration

### Task 13: Enhanced trace with topology classification
- Every trace now includes: topology class, preservation zones, semantic impact
- Auto-measure: diff noise, expansion factor, preserved anchors count

### Task 14: Multi-language type validation
- Add mypy/pyright bridge for Python type checking
- Add `verify: 'typecheck'` support for non-TS languages
- Command auto-detection per package (tsc, mypy, go vet, cargo check)

### Task 15: Fast-path compiler
- Detect task class → auto-select macro-operator instead of micro-operations
- eslint-fix → atomic_apply_eslint_dry_run_fixes (exists)
- refactor-large → atomic_split_service_transaction (new)
- rename-across-files → atomic_rename_symbol_cross_file (exists)
- Task class detection from user intent + file patterns

### Task 16: Benchmark harness
- Measure: time, tokens, tool calls, diff surface, preservation %, proof completeness
- Compare Atomic vs Normal for each task class
- Auto-detect regression in any dimension

---

**Verification:** Every phase ends with smoke tests proving:
1. New language support catches real syntax errors
2. New operations work on non-TS files
3. Trace includes full preservation topology
4. Normal agent comparison shows Atomic superiority

**Execution order:** Phase 1 → Phase 2 → Phase 3 → Phase 4, with partial delivery after each phase.

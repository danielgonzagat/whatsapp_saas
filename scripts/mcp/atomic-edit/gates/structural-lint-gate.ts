/**
 * gates/structural-lint-gate.ts — the exoneration-free STRUCTURAL-LINT fact.
 *
 * Dissolves the single-file, NON-type-aware slice of the SARIF lint atom — the
 * ~922-finding / ~12-rule bucket whose verdict is a pure property of ONE file's
 * token/AST stream, with NO type checker, NO config, NO resolver, NO cross-file
 * lookup. It is the structural sibling of `findings-delta-gate.ts`: same NEW-only
 * delta shape (`ctx.priorOf`), same token-correct perception organ (`astNodes`),
 * same tri-state honesty — but it closes the LARGE decidable rules that
 * findings-delta deliberately left out (it only carried no-debugger /
 * no-duplicate-case). A write may not INTRODUCE a structural-lint finding; a
 * pre-existing one in legacy bytes never blocks an unrelated edit.
 *
 * ── THE DECIDER IT ADAPTS ─────────────────────────────────────────────────────
 * ESLint's finite rule catalog (driver `eslint`, SARIF 2.1.0). Grounded 1:1
 * against the real `tools/sarif/backend.sarif` histogram. The catalog splits into
 * three strata; this gate owns Stratum 1 only:
 *
 *   Stratum 1 — SINGLE-FILE, NON-TYPE-AWARE (this gate, JUDGED):
 *       @typescript-eslint/no-unused-vars  (821)  — unused-IMPORT slice (see Rice line)
 *       no-useless-escape                  (12)   — string/template escape slice
 *       no-empty                           (6)    — empty control block
 *       prefer-const                       (1)    — single-declarator no-reassign slice
 *     Each emitted RED is a finding a human `eslint` run also raises: the slices
 *     are sound UNDER-approximations (never a false positive), and the cases a
 *     slice cannot prove are returned UNJUDGED or simply not emitted — never
 *     red-by-guess.
 *
 *   Stratum 2 — TYPE-AWARE / whole-program (DEFERRED, not faked):
 *       no-unsafe-*, unbound-method, no-floating-promises, require-await,
 *       restrict-template-expressions, no-base-to-string, no-redundant-type-
 *       constituents … (≈3.2k findings). These need resolved types across the
 *       program; the tsc/eslint effect gate owns that truth. Their absence from
 *       our reds is HONEST, not green-by-assumption.
 *
 *   Stratum 0 — formatting (prettier/prettier, 4386): owned by the formatter, not
 *       a structural fact about meaning; out of scope by construction.
 *
 * ── TOKEN-CORRECT PERCEPTION (no whole-file regex) ────────────────────────────
 * Every fact is read through the real tree-sitter parse via `astNodes` — the same
 * organ findings-delta uses. A `debugger`/`from`/`\,` written inside a string,
 * template or comment is a `string` / `template_string` / `comment` node, never
 * the construct it textually resembles, so it is never extracted as a finding.
 * That is token-correctness BY CONSTRUCTION. When no grammar is available
 * `astNodes` returns null and the file degrades to UNJUDGED — never a
 * green-by-assumption. The Mutation Firewall law holds: this gate only PERCEIVES
 * and LOCATES spans; it never writes.
 *
 * ── THE RICE LINE (where each class stops being decidable → unjudged) ─────────
 * `astNodes` returns a FLAT node list: node TYPE + byte-span + start line/col +
 * own text, but NO parent pointers, NO scope boundaries, NO binding resolution.
 * Full scope/reference analysis over a flat list is undecidable (shadowing,
 * closures, block scope, declaration merging, type-only references). So:
 *
 *   • no-unused-vars: the SOUND slice is unused IMPORTS. An import's local binding
 *     name that appears as a value/type identifier ONLY inside import-statement
 *     spans is unused → RED. This RED direction is sound DESPITE shadowing, because
 *     shadowing can only ADD uses (a re-declared local of the same name is still an
 *     identifier occurrence outside the import → we call it used → conservative,
 *     never a false red). Unused params / locals / functions need real scope
 *     analysis and are NOT emitted here — their absence is honest.
 *   • prefer-const: only when the `let` binding name is declared EXACTLY ONCE in
 *     the file (no shadowing ambiguity) and never the LHS of an assignment/update.
 *     A name declared more than once → UNJUDGED for that name (cannot tell which
 *     scope an assignment targets). `let` with no initializer, or destructuring →
 *     not emitted (eslint would not flag a never-initialised `let`, and a pattern
 *     binding may be partially reassigned).
 *   • no-empty: emitted only for a `statement_block` that is provably a control-flow
 *     block (NOT a function/method/arrow body, NOT a catch body — eslint allows
 *     empty catch) AND contains no comment. Containment is decided by byte-span
 *     against function/catch nodes from the same parse.
 *   • no-useless-escape: emitted only for STRING / TEMPLATE escapes whose escaped
 *     char is unambiguously outside the ECMAScript meaningful-escape set. REGEX
 *     escape uselessness is char-class-context-sensitive (eslint's own algorithm
 *     is non-trivial); we DO NOT emit regex cases — honest under-approximation.
 *   • no grammar for the file → the whole file is UNJUDGED.
 */
import { type GateModule, type GateContext, type GateResult, type GateRed } from './contract.js';
import { langOf } from './perception.js';
import { astNodes, type AstNode } from '../native-bridge.js';

/** Source files where the JS/TS structural-lint subset applies. */
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * The type-aware rule frontier — Stratum 2, DOCUMENTED so the ceiling is explicit
 * and the effect gate (tsc/eslint apply→run→revert) knows what it inherits.
 * Grounded 1:1 against backend.sarif's histogram. This static gate refuses to
 * emit any of these: they require the type checker.
 */
export const STRUCTURAL_LINT_DEFERRED = new Set<string>([
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/unbound-method',
  '@typescript-eslint/no-base-to-string',
  '@typescript-eslint/require-await',
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/await-thenable',
  '@typescript-eslint/restrict-template-expressions',
  '@typescript-eslint/no-redundant-type-constituents',
]);

/** The structural (Stratum 1) rules this gate actually decides. */
export const STRUCTURAL_LINT_JUDGED = new Set<string>([
  '@typescript-eslint/no-unused-vars',
  'no-useless-escape',
  'no-empty',
  'prefer-const',
]);

/** A single structural-lint finding located by AST node position. */
interface Finding {
  ruleId: string;
  message: string;
  /** 1-based line */
  line: number;
  /** 1-based column */
  col: number;
}

/**
 * ECMAScript meaningful single-/double-quoted-STRING & TEMPLATE escape chars. A
 * `\` followed by one of these carries meaning, so it is NOT a useless escape:
 *   - quote/backtick/backslash : the literal delimiters and the escape char itself
 *   - b f n r t v 0            : the control escapes
 *   - x u                      : hex / unicode escapes
 *   - newline / carriage-ret   : line continuation
 *   - 1-9                      : legacy octal / back-reference shape — conservatively
 *                                treated as meaningful so we never red a digit escape
 * Any OTHER escaped char in a string/template is a useless escape per eslint's
 * `no-useless-escape`. We flag only chars unambiguously outside this set, so the
 * RED is always a real finding (sound under-approximation). `\\` consumes the next
 * char as data, so the scanner skips it (handled in `scanStringEscapes`).
 */
const MEANINGFUL_STRING_ESCAPE = new Set<string>([
  '\\', "'", '"', '`',
  'b', 'f', 'n', 'r', 't', 'v', '0',
  'x', 'u',
  '\n', '\r',
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  // `$` and `{` are meaningful inside a template (escaping interpolation), and `$`
  // is harmless to whitelist in plain strings too — conservative (avoids false red).
  '$', '{',
]);

/** The smallest-span node in `pool` whose byte range strictly/loosely contains [start,end). */
function innermostContaining(
  pool: AstNode[],
  start: number,
  end: number,
): AstNode | null {
  let best: AstNode | null = null;
  for (const b of pool) {
    if (b.byteStart <= start && end <= b.byteEnd) {
      if (!best || b.byteEnd - b.byteStart < best.byteEnd - best.byteStart) best = b;
    }
  }
  return best;
}

/** True iff [start,end) lies inside ANY span in `pool`. */
function containedInAny(pool: AstNode[], start: number, end: number): boolean {
  for (const b of pool) {
    if (b.byteStart <= start && end <= b.byteEnd) return true;
  }
  return false;
}

/**
 * The local binding name of an import construct, read from real nodes:
 *   - `import_specifier`  : "Foo" → Foo ; "Bar as Baz" → Baz (the LAST identifier)
 *   - `namespace_import`  : "* as NS" → NS
 *   - default `import_clause` whose text is a bare identifier : "Def" → Def
 * Returns { name, byteStart, byteEnd } of the BINDING identifier (so its own
 * occurrence is excluded from the use census), or null when the shape is not a
 * simple binding we can read.
 */
function importBindingName(node: AstNode): string | null {
  const t = node.text.trim();
  if (node.type === 'namespace_import') {
    const m = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(t);
    return m ? m[1] : null;
  }
  if (node.type === 'import_specifier') {
    // "Bar as Baz" → Baz ; "Foo" → Foo. The local name is the trailing identifier.
    const m = /([A-Za-z_$][\w$]*)\s*$/.exec(t);
    return m ? m[1] : null;
  }
  return null;
}

/**
 * The single-file structural analyzer. A conservative, deterministic slice of the
 * non-type-aware eslint rule family — each emitted finding is a property of THIS
 * file's AST node stream alone (no config, no resolver, no cross-file lookup, no
 * types). Returns null when no grammar is available → caller marks the file
 * UNJUDGED rather than guessing.
 */
async function analyzeStructural(content: string, rel: string): Promise<Finding[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(
    content,
    lang,
    new Set([
      // unused-imports (value-position `identifier` AND type-position `type_identifier`
      // AND object-shorthand `shorthand_property_identifier` all count as a USE)
      'import_statement', 'import_specifier', 'namespace_import',
      'identifier', 'type_identifier', 'shorthand_property_identifier',
      // prefer-const
      'lexical_declaration', 'variable_declarator', 'assignment_expression', 'augmented_assignment_expression', 'update_expression',
      // no-empty
      'statement_block', 'catch_clause', 'function_declaration', 'function_expression',
      'arrow_function', 'method_definition', 'generator_function', 'generator_function_declaration',
      'comment',
      // no-useless-escape
      'string', 'template_string', 'escape_sequence', 'regex', 'regex_pattern',
    ]),
  );
  if (nodes === null) return null; // no grammar → undecidable, caller → unjudged

  const findings: Finding[] = [];
  // Pre-filter escapes that are NOT plain-string escapes: regex literals (backslash
  // is regex syntax) and TAGGED templates (String.raw / sql / gql, whose raw-vs-cooked
  // semantics are decided by the tag at RUNTIME, undecidable statically). Their escapes
  // are meaningful and non-removable, so no-useless-escape must never flag them. Sound
  // under-approximation: an escape whose container cannot be decided is also dropped.
  const escapeContainers = nodes.filter(
    (node) => node.type === 'regex' || node.type === 'regex_pattern' ||
      node.type === 'string' || node.type === 'template_string',
  );
  const contentBytes = Buffer.from(content, 'utf8');
  const isTaggedTemplateAt = (openByte: number): boolean => {
    let i = openByte - 1;
    while (i >= 0) {
      const b = contentBytes[i];
      if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) { i--; continue; }
      break;
    }
    if (i < 0) return false;
    const b = contentBytes[i];
    return (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) ||
      (b >= 0x30 && b <= 0x39) || b === 0x5f || b === 0x24 || b === 0x29 || b === 0x5d;
  };
  const nodesForUselessEscape = nodes.filter((n) => {
    if (n.type !== 'escape_sequence') return true;
    const c = innermostContaining(escapeContainers, n.byteStart, n.byteEnd);
    if (c === null) return false;
    if (c.type === 'regex' || c.type === 'regex_pattern') return false;
    if (c.type === 'template_string' && isTaggedTemplateAt(c.byteStart)) return false;
    return true;
  });
  emitUnusedImports(nodes, findings);
  emitPreferConst(nodes, findings);
  emitNoEmpty(nodes, findings);
  emitNoUselessEscape(nodesForUselessEscape, findings);
  // Stable, deterministic order: by source position, so the proof and the lens
  // see the same locus ordering every run.
  findings.sort((a, b) => (a.line - b.line) || (a.col - b.col) || a.ruleId.localeCompare(b.ruleId));
  return findings;
}

/**
 * no-unused-vars — the SOUND unused-IMPORT slice. For each import binding, count
 * name occurrences of its binding that lie OUTSIDE every import-statement span.
 * Zero → unused → RED at the binding. Sound under shadowing (shadowing only ADDS
 * occurrences → never a false red). A "use" is any of THREE node types, so the
 * census never false-reds a binding that is only consumed indirectly:
 *   - `identifier`                    : value position (`x = Foo`)
 *   - `type_identifier`               : type position (`const a: Foo`, `type T = Foo`)
 *   - `shorthand_property_identifier` : object shorthand (`{ Foo }`)
 * (Type-position refs are `type_identifier`, NOT `identifier`, in tree-sitter-ts —
 * counting only `identifier` would false-red a type-only import.) We do NOT attempt
 * unused params/locals/functions (needs a real scope graph) — their absence is honest.
 */
const USE_NODE_TYPES = new Set<string>([
  'identifier',
  'type_identifier',
  'shorthand_property_identifier',
]);
function emitUnusedImports(nodes: AstNode[], out: Finding[]): void {
  const importStmts = nodes.filter((n) => n.type === 'import_statement');
  if (importStmts.length === 0) return;
  const specifiers = nodes.filter(
    (n) => n.type === 'import_specifier' || n.type === 'namespace_import',
  );
  // All name occurrences (value + type + shorthand) OUTSIDE any import statement.
  const usesOutsideImports = new Map<string, number>();
  for (const id of nodes) {
    if (!USE_NODE_TYPES.has(id.type)) continue;
    if (containedInAny(importStmts, id.byteStart, id.byteEnd)) continue;
    usesOutsideImports.set(id.text, (usesOutsideImports.get(id.text) ?? 0) + 1);
  }
  for (const spec of specifiers) {
    const name = importBindingName(spec);
    if (name === null) continue; // shape we cannot read → do not guess
    if ((usesOutsideImports.get(name) ?? 0) === 0) {
      out.push({
        ruleId: '@typescript-eslint/no-unused-vars',
        message: `'${name}' is defined but never used.`,
        line: spec.line,
        col: spec.column,
      });
    }
  }
}

/**
 * prefer-const — the SOUND single-declarator slice. A `let` declaration whose
 * binding name is declared EXACTLY ONCE in the file (no shadowing ambiguity), has
 * an initializer, is a plain identifier (not a pattern), and is never the LHS of
 * an `assignment_expression` or `update_expression` anywhere → could be `const`.
 * When a name is declared more than once we CANNOT tell which scope an assignment
 * targets → we skip it (honest non-emission, the analyzer-level "unjudged").
 */
function emitPreferConst(nodes: AstNode[], out: Finding[]): void {
  const decls = nodes.filter((n) => n.type === 'lexical_declaration');
  const declarators = nodes.filter((n) => n.type === 'variable_declarator');
  // LHS targets of assignment / update expressions (the reassigned names).
  const reassigned = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'assignment_expression' || n.type === 'augmented_assignment_expression') {
      const m = /^([A-Za-z_$][\w$]*)\s*(?:>>>=|>>=|<<=|\+=|-=|\*=|\/=|%=|&&=|\|\|=|\?\?=|&=|\|=|\^=|=)/.exec(n.text.trim());
      if (m) reassigned.add(m[1]);
    } else if (n.type === 'update_expression') {
      const m = /([A-Za-z_$][\w$]*)/.exec(n.text.replace(/^[+-]{2}/, '').trim());
      if (m) reassigned.add(m[1]);
    }
  }
  // How many times each plain-identifier binding name is declared (any kind).
  const declCount = new Map<string, number>();
  const plainTarget = (d: AstNode): string | null => {
    // "<name> = <init>"  → <name> ; reject array/object patterns and no-init forms.
    const t = d.text.trim();
    const m = /^([A-Za-z_$][\w$]*)\s*=/.exec(t);
    return m ? m[1] : null;
  };
  for (const d of declarators) {
    const name = plainTarget(d);
    if (name) declCount.set(name, (declCount.get(name) ?? 0) + 1);
  }
  for (const decl of decls) {
    if (!/^let\b/.test(decl.text.trimStart())) continue; // only `let` declarations
    // a `let a, b;` multi-declarator is skipped (one of them might be reassigned);
    // we only judge a single-declarator `let`.
    const childDeclarators = declarators.filter(
      (d) => d.byteStart >= decl.byteStart && d.byteEnd <= decl.byteEnd,
    );
    if (childDeclarators.length !== 1) continue;
    const name = plainTarget(childDeclarators[0]);
    if (name === null) continue; // pattern / no initializer → not emitted
    if ((declCount.get(name) ?? 0) !== 1) continue; // shadowing ambiguity → skip
    if (reassigned.has(name)) continue; // reassigned somewhere → correctly `let`
    out.push({
      ruleId: 'prefer-const',
      message: `'${name}' is never reassigned. Use 'const' instead.`,
      line: decl.line,
      col: decl.column,
    });
  }
}

/**
 * no-empty — empty control-flow block. A `statement_block` whose inner content is
 * whitespace-only, that is NOT a function/method/arrow body and NOT a catch body
 * (eslint allows empty catch), and that contains NO comment (eslint allows an
 * empty block with an explanatory comment). Body-ness is decided by byte-span:
 * a block whose innermost containing function-like node ENDS at the same byte the
 * block ends is that function's body. A block inside a catch_clause is a catch body.
 */
function emitNoEmpty(nodes: AstNode[], out: Finding[]): void {
  const blocks = nodes.filter((n) => n.type === 'statement_block');
  const comments = nodes.filter((n) => n.type === 'comment');
  const catches = nodes.filter((n) => n.type === 'catch_clause');
  const funcLike = nodes.filter((n) =>
    n.type === 'function_declaration' ||
    n.type === 'function_expression' ||
    n.type === 'arrow_function' ||
    n.type === 'method_definition' ||
    n.type === 'generator_function' ||
    n.type === 'generator_function_declaration',
  );
  for (const blk of blocks) {
    // empty = the text between the braces is whitespace only.
    const inner = blk.text.slice(1, -1); // drop the surrounding { }
    if (inner.trim() !== '') continue; // has statements → not empty
    // a comment inside the block → eslint allows it (intentional empty).
    if (containedInAny(comments, blk.byteStart + 1, blk.byteEnd - 1)) continue;
    // function/method/arrow body → eslint's no-empty does not target these.
    const fn = innermostContaining(funcLike, blk.byteStart, blk.byteEnd);
    if (fn && fn.byteEnd === blk.byteEnd) continue;
    // catch body → eslint allows an empty catch by default.
    const cc = innermostContaining(catches, blk.byteStart, blk.byteEnd);
    if (cc && cc.byteEnd === blk.byteEnd) continue;
    out.push({
      ruleId: 'no-empty',
      message: 'Empty block statement.',
      line: blk.line,
      col: blk.column,
    });
  }
}

/**
 * no-useless-escape — the STRING / TEMPLATE escape slice. tree-sitter emits a
 * dedicated `escape_sequence` node for every `\X` inside a string/template; we
 * flag those whose escaped char is unambiguously outside MEANINGFUL_STRING_ESCAPE.
 * Because the escape is a real `escape_sequence` node (never a `\` that lives in a
 * comment or in code), this is token-correct by construction. REGEX escapes live
 * inside `regex_pattern` text and are char-class-context-sensitive, so we DO NOT
 * emit them — honest under-approximation (their absence is not a green claim).
 */
function emitNoUselessEscape(nodes: AstNode[], out: Finding[]): void {
  for (const n of nodes) {
    if (n.type !== 'escape_sequence') continue;
    if (n.text.length < 2 || n.text[0] !== '\\') continue; // not a `\X` shape
    const escaped = n.text[1];
    if (MEANINGFUL_STRING_ESCAPE.has(escaped)) continue;
    // unambiguously useless: a `\` before an ordinary char that needs no escaping.
    out.push({
      ruleId: 'no-useless-escape',
      message: `Unnecessary escape character: \\${escaped}.`,
      line: n.line,
      col: n.column,
    });
  }
}

/**
 * Stable identity of a finding for set-membership: rule + message (NOT line — a
 * finding that merely shifts lines is the SAME finding). Matches the SARIF
 * (where=file, which-rule, verdict) identity minus the volatile region. The
 * message carries the binding/char name, so two distinct unused imports are two
 * distinct keys (introducing a new one is a real delta).
 */
function findingKey(f: Finding): string {
  return `${f.ruleId}::${f.message}`;
}

/** Multiset of finding-keys → count, so a SECOND identical finding is still a delta. */
function keyCounts(findings: Finding[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of findings) m.set(findingKey(f), (m.get(findingKey(f)) ?? 0) + 1);
  return m;
}

/**
 * The fact, over the context. For each changed source file, run the structural
 * analyzer on the CANDIDATE and on the PRIOR content, and red iff the candidate
 * raises a finding-key MORE times than the prior did (a NEW finding). Same
 * NEW-only delta semantics as the connection byte floor and findings-delta: a
 * pre-existing finding never blocks an unrelated edit, but no write may INTRODUCE
 * one. A file whose grammar is unavailable (analyzer → null) is not counted toward
 * judged-ness; if NO file was judgeable, the gate is honestly UNJUDGED.
 */
async function runStructuralLint(ctx: GateContext): Promise<GateResult> {
  const reds: GateRed[] = [];
  let judgedAny = false;

  for (const rel of ctx.changedFiles) {
    if (!SOURCE_RE.test(rel)) continue;
    const candidate = ctx.overlay.get(rel.replaceAll('\\', '/')) ?? ctx.readFile(rel);
    if (candidate == null) continue;

    // prior bytes = pre-write content (write direction) / '' (lens direction).
    // A brand-new file has no prior → every finding in it is this write's claim.
    const prior = ctx.priorOf(rel);
    const afterFindings = await analyzeStructural(candidate, rel);
    if (afterFindings === null) continue; // no grammar → cannot judge this file
    const beforeFindings = await analyzeStructural(prior, rel);
    judgedAny = true;

    const before = keyCounts(beforeFindings ?? []);
    const after = keyCounts(afterFindings);
    // Pre-index candidate findings so the NEW-occurrence locus is exact.
    const byKey = new Map<string, Finding[]>();
    for (const f of afterFindings) {
      const arr = byKey.get(findingKey(f));
      if (arr) arr.push(f);
      else byKey.set(findingKey(f), [f]);
    }

    for (const [key, afterN] of after) {
      const beforeN = before.get(key) ?? 0;
      if (afterN <= beforeN) continue; // not this write's claim — pre-existing
      const all = byKey.get(key) ?? [];
      const newOnes = all.slice(Math.max(0, all.length - (afterN - beforeN)));
      for (const f of newOnes) {
        reds.push({
          file: rel,
          locus: `L${f.line}:${f.col}`,
          fact: `${f.ruleId}: ${f.message}`,
        });
      }
    }
  }

  if (!judgedAny) {
    return {
      gate: 'structural-lint',
      green: true,
      reds: [],
      unjudged: true,
      note: 'no judgeable source file in the change set (structural subset has nothing to assert)',
    };
  }

  return {
    gate: 'structural-lint',
    green: reds.length === 0,
    reds,
    note:
      'no write may INTRODUCE a single-file structural-lint finding (NEW-only delta vs prior bytes): ' +
      'unused-import / prefer-const / no-empty / no-useless-escape; type-aware rules deferred to the effect gate',
  };
}

const structuralLintGate: GateModule = {
  name: 'structural-lint',
  kind: 'static',
  appliesTo: (rel: string): boolean => SOURCE_RE.test(rel),
  run: runStructuralLint,
};

export default structuralLintGate;

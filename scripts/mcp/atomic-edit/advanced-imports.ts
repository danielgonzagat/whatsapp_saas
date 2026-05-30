import * as ts from 'typescript';
import { validate, type ValidationResult } from './engine.js';
import { resolveSymbol } from './symbols.js';

// ── v3: import + object-property semantic ops (adopted from Codex's
//        semantic-edit, but routed through validate()+atomic write so they
//        cannot persist broken code, unlike the original). ───────────────────

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const RESERVED_IDENTIFIER_KEYS = new Set('await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield'.split(' '));

function assertTs(file: string, op: string): void {
  const i = file.lastIndexOf('.');
  const ext = i < 0 ? '' : file.slice(i).toLowerCase();
  if (!TS_EXT.has(ext)) throw new Error(`${op} only supports TS/JS files, got ${ext || '(none)'}`);
}

async function tsmProject(file: string, text: string) {
  const { Project } = await import('ts-morph');
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  return project.createSourceFile(file, text, { overwrite: true });
}

function preferredImportQuote(original: string): string {
  const counts: Record<string, number> = { "'": 0, '"': 0 };
  for (const match of original.matchAll(/\bfrom\s+(['"])[^'"\n]+?\1/g)) {
    counts[match[1] ?? "'"] = (counts[match[1] ?? "'"] ?? 0) + 1;
  }
  for (const match of original.matchAll(/^\s*import\s+(['"])[^'"\n]+?\1/gm)) {
    counts[match[1] ?? "'"] = (counts[match[1] ?? "'"] ?? 0) + 1;
  }
  return (counts["'"] ?? 0) >= (counts['"'] ?? 0) ? "'" : '"';
}

function escapeRegExp(value: string): string {
  const slash = String.fromCharCode(92);
  const specialChars = new Set([
    '^',
    '$',
    '.',
    '*',
    '+',
    '?',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    '|',
    slash,
  ]);
  let escaped = '';
  for (const char of value) {
    escaped += specialChars.has(char) ? slash + char : char;
  }
  return escaped;
}

function normalizeModuleSpecifierQuote(
  text: string,
  moduleSpecifier: string,
  quote: string,
): string {
  if (quote !== "'" || moduleSpecifier.includes("'")) return text;
  const escapedModule = escapeRegExp(moduleSpecifier);
  return text
    .replace(
      new RegExp('\\bfrom\\s+"' + escapedModule + '"', 'g'),
      "from '" + moduleSpecifier + "'",
    )
    .replace(
      new RegExp('\\bimport\\s+"' + escapedModule + '"', 'g'),
      "import '" + moduleSpecifier + "'",
    );
}

export interface SemanticEditResult {
  newText: string;
  validation: ValidationResult;
  detail: Record<string, unknown>;
}

/**
 * ts-morph validates on manipulation and THROWS when the produced tree is
 * unparseable. Wrap mutations so the engine contract stays uniform: return a
 * failed-validation result (newText unchanged) instead of throwing, exactly
 * like applyEdits/editSymbol. Genuine "no such symbol/property" errors still
 * throw (caller-actionable), only manipulation-produced syntax breakage is
 * converted.
 */
function guardedMutation(
  file: string,
  original: string,
  detail: Record<string, unknown>,
  mutate: () => string,
): SemanticEditResult {
  try {
    const next = mutate();
    return { newText: next, validation: validate(file, original, next), detail };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/manipulation|syntax|parse|Error replacing/i.test(msg)) {
      return {
        newText: original,
        validation: {
          language: 'ts',
          before: 0,
          after: 1,
          ok: false,
          introduced: msg.split('\n')[0],
        },
        detail,
      };
    }
    throw e;
  }
}

/** Add a named import; dedupes, creates the declaration if absent, supports alias. */
export async function addNamedImport(
  file: string,
  original: string,
  moduleSpecifier: string,
  name: string,
  alias?: string,
  typeOnly = false,
): Promise<SemanticEditResult> {
  assertTs(file, 'add_import');
  const sf = await tsmProject(file, original);
  const decls = sf
    .getImportDeclarations()
    .filter((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (decls.length > 1)
    throw new Error(
      `module "${moduleSpecifier}" has ${decls.length} import declarations; ambiguous`,
    );
  const local = alias ?? name;
  if (decls.length === 1) {
    const exists = decls[0]
      .getNamedImports()
      .some(
        (ni) =>
          ni.getName() === name &&
          (ni.getAliasNode()?.getText() ?? ni.getName()) === local &&
          ni.isTypeOnly() === typeOnly,
      );
    if (exists) {
      return {
        newText: original,
        validation: validate(file, original, original),
        detail: { action: 'already-present', moduleSpecifier, name, typeOnly },
      };
    }
  }
  const action = decls.length === 0 ? 'created-declaration' : 'added-specifier';
  return guardedMutation(
    file,
    original,
    { action, moduleSpecifier, name, alias: alias ?? null, typeOnly },
    () => {
      if (decls.length === 0) {
        sf.addImportDeclaration({
          moduleSpecifier,
          namedImports: [
            alias ? { name, alias, isTypeOnly: typeOnly } : { name, isTypeOnly: typeOnly },
          ],
        });
      } else {
        decls[0].addNamedImport(
          alias ? { name, alias, isTypeOnly: typeOnly } : { name, isTypeOnly: typeOnly },
        );
      }
      return normalizeModuleSpecifierQuote(
        sf.getFullText(),
        moduleSpecifier,
        preferredImportQuote(original),
      );
    },
  );
}

/** Remove a named import by imported-or-local name; drops the declaration if it was the last. */
export async function removeNamedImport(
  file: string,
  original: string,
  moduleSpecifier: string,
  name: string,
): Promise<SemanticEditResult> {
  assertTs(file, 'remove_import');
  const sf = await tsmProject(file, original);
  const decls = sf
    .getImportDeclarations()
    .filter((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (decls.length !== 1)
    throw new Error(`module "${moduleSpecifier}" matched ${decls.length} import declarations`);
  const decl = decls[0];
  const named = decl.getNamedImports();
  const target = named.find(
    (ni) => ni.getName() === name || (ni.getAliasNode()?.getText() ?? ni.getName()) === name,
  );
  if (!target) throw new Error(`named import "${name}" not found for "${moduleSpecifier}"`);
  const dropDecl = named.length === 1 && !decl.getDefaultImport() && !decl.getNamespaceImport();
  return guardedMutation(
    file,
    original,
    { action: dropDecl ? 'removed-declaration' : 'removed-specifier', moduleSpecifier, name },
    () => {
      if (dropDecl) decl.remove();
      else target.remove();
      return sf.getFullText();
    },
  );
}

/**
 * Replace the initializer of an object property by name, optionally scoped to
 * a symbol selector so identically-named properties elsewhere are untouched.
 * Refuses ambiguous matches.
 */
export async function replacePropertyValue(
  file: string,
  original: string,
  property: string,
  valueCode: string,
  selector?: string,
): Promise<SemanticEditResult> {
  assertTs(file, 'replace_property_value');
  const { SyntaxKind } = await import('ts-morph');
  const sf = await tsmProject(file, original);
  const scopeNode = selector ? resolveSymbol(sf, selector).node : sf;
  const hits = scopeNode.getDescendantsOfKind(SyntaxKind.PropertyAssignment).filter((pa) => {
    const n = pa.getNameNode();
    const k = n.getKind();
    const nm =
      k === SyntaxKind.Identifier ||
      k === SyntaxKind.StringLiteral ||
      k === SyntaxKind.NumericLiteral
        ? n.getText().replace(/^['"]|['"]$/g, '')
        : null;
    return nm === property;
  });
  if (hits.length === 0)
    throw new Error(`property "${property}" not found${selector ? ` in ${selector}` : ''}`);
  if (hits.length > 1) {
    throw new Error(
      `property "${property}" matched ${hits.length} assignments (lines ${hits
        .map((h) => h.getStartLineNumber())
        .join(', ')}); pass a selector to disambiguate`,
    );
  }
  const line = hits[0].getStartLineNumber();
  return guardedMutation(file, original, { property, selector: selector ?? null, line }, () => {
    hits[0].getInitializerOrThrow().replaceWithText(valueCode);
    return sf.getFullText();
  });
}

/**
 * Rename an object property key while preserving its initializer/value exactly.
 * The operator is intentionally narrow: identifiers only for the new key,
 * optional selector scope, and ambiguous matches are refused.
 */
export async function renamePropertyKey(
  file: string,
  original: string,
  property: string,
  newKey: string,
  selector?: string,
): Promise<SemanticEditResult> {
  assertTs(file, 'rename_property_key');
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newKey) || RESERVED_IDENTIFIER_KEYS.has(newKey)) {
    throw new Error(`invalid new key identifier: ${JSON.stringify(newKey)}`);
  }
  const { SyntaxKind } = await import('ts-morph');
  const sf = await tsmProject(file, original);
  const scopeNode = selector ? resolveSymbol(sf, selector).node : sf;
  const hits = scopeNode.getDescendantsOfKind(SyntaxKind.PropertyAssignment).filter((pa) => {
    const nameNode = pa.getNameNode();
    const kind = nameNode.getKind();
    const name =
      kind === SyntaxKind.Identifier ||
      kind === SyntaxKind.StringLiteral ||
      kind === SyntaxKind.NumericLiteral
        ? nameNode.getText().replace(/^['"]|['"]$/g, '')
        : null;
    return name === property;
  });
  if (hits.length === 0) {
    throw new Error(`property "${property}" not found${selector ? ` in ${selector}` : ''}`);
  }
  if (hits.length > 1) {
    throw new Error(
      `property "${property}" matched ${hits.length} assignments (lines ${hits
        .map((hit) => hit.getStartLineNumber())
        .join(', ')}); pass a selector to disambiguate`,
    );
  }
  const hit = hits[0];
  const nameNode = hit.getNameNode();
  const initializerText = hit.getInitializerOrThrow().getText();
  const line = hit.getStartLineNumber();
  return guardedMutation(
    file,
    original,
    { property, newKey, selector: selector ?? null, line, preservedValue: initializerText },
    () => {
      nameNode.replaceWithText(newKey);
      return sf.getFullText();
    },
  );
}

/**
 * Find a CallExpression by callee name/text and optional selector scope;
 * wrap exactly that call expression as `await <callText>`, preserving
 * callee, arguments, and call text. Refuses missing target, ambiguity,
 * already-awaited call, non-async context, and syntax regression.
 */
export async function addAwaitToCall(
  file: string,
  original: string,
  callee: string,
  selector?: string,
): Promise<SemanticEditResult> {
  assertTs(file, 'add_await_to_call');
  const { SyntaxKind, Node } = await import('ts-morph');
  const sf = await tsmProject(file, original);
  const scopeNode = selector ? resolveSymbol(sf, selector).node : sf;
  const calls = scopeNode.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression();
    return (
      expr.getText() === callee ||
      (Node.isPropertyAccessExpression(expr) && expr.getName() === callee)
    );
  });
  if (calls.length === 0) {
    throw new Error(`call "${callee}" not found${selector ? ` in ${selector}` : ''}`);
  }
  if (calls.length > 1) {
    throw new Error(
      `call "${callee}" matched ${calls.length} call expressions (lines ${calls
        .map((c) => c.getStartLineNumber())
        .join(', ')}); pass a selector to disambiguate`,
    );
  }
  const call = calls[0];
  if (call.getParentIfKind(SyntaxKind.AwaitExpression)) {
    throw new Error(`call "${callee}" is already awaited`);
  }
  const functionScope = call.getFirstAncestor(
    (node) =>
      Node.isFunctionDeclaration(node) ||
      Node.isFunctionExpression(node) ||
      Node.isArrowFunction(node) ||
      Node.isMethodDeclaration(node),
  ) as
    | import('ts-morph').FunctionDeclaration
    | import('ts-morph').FunctionExpression
    | import('ts-morph').ArrowFunction
    | import('ts-morph').MethodDeclaration
    | undefined;
  if (
    !functionScope
      ?.getModifiers()
      .some((modifier) => modifier.getKind() === SyntaxKind.AsyncKeyword)
  ) {
    throw new Error(`call "${callee}" is not inside an async function or method`);
  }
  const line = call.getStartLineNumber();
  const callText = call.getText();
  return guardedMutation(
    file,
    original,
    { callee, selector: selector ?? null, line, callText },
    () => {
      call.replaceWithText(`await ${callText}`);
      return sf.getFullText();
    },
  );
}

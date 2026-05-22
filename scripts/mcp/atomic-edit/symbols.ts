/**
 * Symbol resolution — the read/address side the literature says matters most.
 *
 * CodeStruct (Amazon, 2026) ablation: removing the structured READ primitive
 * costs −7.8pp Pass@1 and makes agents issue 7.8× more brittle str_replace
 * calls. v1 of this server had no read side at all. This module is that side:
 * it lets the agent address code by NAMED AST ENTITY (scoped selector,
 * fuzzy-matched) instead of by line numbers or text patterns — the single
 * highest-leverage fix from the research.
 *
 * Selector grammar (CodeStruct `file::Class::method` style, language-agnostic
 * here since the file is already chosen):
 *   "name"                unscoped: top-level function/class/interface/type/var
 *   "Class.method"        scoped:   method or property of a class
 *   "Class::method"       same, :: also accepted
 *   "Outer.Inner.member"  nested scopes
 * Matching is exact-first, then case-insensitive, then unique-substring fuzzy.
 */

import type { Node, SourceFile } from 'ts-morph';

export interface SymbolInfo {
  selector: string;
  kind: string;
  /** 1-based start line. */
  startLine: number;
  /** 1-based end line. */
  endLine: number;
  /** signature line, e.g. "async load(id: string): Promise<User>". */
  signature: string;
}

export interface ResolvedSymbol {
  node: Node;
  info: SymbolInfo;
}

const CONTAINER_KINDS = new Set([
  'ClassDeclaration',
  'InterfaceDeclaration',
  'ModuleDeclaration',
  'EnumDeclaration',
]);

function firstLineOf(text: string): string {
  const nl = text.indexOf('\n');
  const head = (nl === -1 ? text : text.slice(0, nl)).trim();
  return head.length > 160 ? `${head.slice(0, 157)}...` : head;
}

function nameOf(node: Node): string | undefined {
  const anyNode = node as unknown as { getName?: () => string | undefined };
  if (typeof anyNode.getName === 'function') {
    try {
      const n = anyNode.getName();
      if (n) return n;
    } catch {
      /* some nodes throw if unnamed */
    }
  }
  return undefined;
}

/** Top-level + one-level-nested named declarations, with signatures. */
export function listSignatures(sf: SourceFile): SymbolInfo[] {
  const out: SymbolInfo[] = [];
  const visit = (node: Node, scope: string[]): void => {
    const kind = node.getKindName();
    const name = nameOf(node);
    const named =
      name &&
      (kind.endsWith('Declaration') ||
        kind === 'MethodDeclaration' ||
        kind === 'PropertyDeclaration' ||
        kind === 'GetAccessor' ||
        kind === 'SetAccessor' ||
        kind === 'Constructor');
    if (named) {
      const selector = [...scope, name].join('.');
      out.push({
        selector,
        kind,
        startLine: node.getStartLineNumber(),
        endLine: node.getEndLineNumber(),
        signature: firstLineOf(node.getText()),
      });
      if (CONTAINER_KINDS.has(kind)) {
        for (const child of node.getChildSyntaxList()?.getChildren() ?? []) {
          visit(child, [...scope, name]);
        }
        return;
      }
    }
  };
  for (const child of sf.getChildSyntaxList()?.getChildren() ?? []) {
    visit(child, []);
  }
  // variable statements (export const X = ...) — surface the binding names
  for (const vs of sf.getVariableStatements()) {
    for (const d of vs.getDeclarations()) {
      out.push({
        selector: d.getName(),
        kind: 'VariableDeclaration',
        startLine: vs.getStartLineNumber(),
        endLine: vs.getEndLineNumber(),
        signature: firstLineOf(vs.getText()),
      });
    }
  }
  return out.sort((a, b) => a.startLine - b.startLine);
}

function symbolKey(info: SymbolInfo): string {
  return `${info.selector}:${info.kind}:${info.startLine}:${info.endLine}`;
}

function matchSymbolInfos(all: SymbolInfo[], parts: string[]): SymbolInfo[] {
  const selector = parts.join('.');
  const tail = parts[parts.length - 1];
  const exact = all.filter((s) => s.selector === selector);
  const ci = all.filter((s) => s.selector.toLowerCase() === selector.toLowerCase());
  const byTail = all.filter((s) => {
    const segs = s.selector.split('.');
    return segs[segs.length - 1] === tail;
  });

  const chosen: SymbolInfo[] = exact.length ? exact : ci.length ? ci : byTail;
  if (chosen.length > 0) return chosen;
  return all.filter((s) => s.selector.toLowerCase().includes(tail.toLowerCase()));
}

function listLocalResolvableSymbols(sf: SourceFile, known: SymbolInfo[]): SymbolInfo[] {
  const supportedKinds = new Set([
    'VariableDeclaration',
    'FunctionDeclaration',
    'ClassDeclaration',
    'InterfaceDeclaration',
    'TypeAliasDeclaration',
    'EnumDeclaration',
  ]);
  const seen = new Set(known.map(symbolKey));
  const out: SymbolInfo[] = [];
  for (const node of sf.getDescendants()) {
    const kind = node.getKindName();
    if (!supportedKinds.has(kind)) continue;
    const name = nameOf(node);
    if (!name) continue;
    const info: SymbolInfo = {
      selector: name,
      kind,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      signature: firstLineOf(node.getText()),
    };
    const key = symbolKey(info);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(info);
  }
  return out.sort((a, b) => a.startLine - b.startLine);
}

/**
 * Resolve a scoped/unscoped selector to a single node. Throws on no-match or
 * ambiguity (with the candidate list, so the caller can disambiguate) — never
 * silently picks, mirroring CodeStruct's deterministic resolution.
 */
export function resolveSymbol(sf: SourceFile, selector: string): ResolvedSymbol {
  const parts = selector
    .split(/::|\./)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error(`empty selector`);
  const primary = listSignatures(sf);
  const locals = listLocalResolvableSymbols(sf, primary);
  const chosen = matchSymbolInfos(primary, parts);
  const localChosen = chosen.length === 0 ? matchSymbolInfos(locals, parts) : [];
  const resolved = chosen.length > 0 ? chosen : localChosen;
  const all = [...primary, ...locals];

  if (resolved.length === 0) {
    throw new Error(
      `no symbol matches "${selector}". Available: ${all.map((s) => s.selector).join(', ') || '(none)'}`,
    );
  }
  if (resolved.length > 1) {
    throw new Error(
      `ambiguous selector "${selector}" -> [${resolved
        .map((c) => `${c.selector}@${c.startLine}`)
        .join(', ')}]. Use a more specific scoped selector.`,
    );
  }
  const info = resolved[0];
  const node = sf
    .getDescendants()
    .find(
      (d) =>
        d.getStartLineNumber() === info.startLine &&
        d.getEndLineNumber() === info.endLine &&
        d.getKindName() === info.kind,
    );
  if (!node) throw new Error(`internal: resolved "${selector}" but node not found`);
  return { node, info };
}

export interface NodeAtPosition {
  node: Node;
  kind: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  text: string;
}

export function resolveNodeAtPosition(sf: SourceFile, line: number, column: number): NodeAtPosition {
  let deepest: Node | undefined;
  let depth = -1;
  const walk = (node: Node, d: number): void => {
    const startLine = node.getStartLineNumber();
    const endLine = node.getEndLineNumber();
    const start = node.getStart();
    const end = node.getEnd();
    const startLinePos = node.getStartLinePos();
    const startCol = start - startLinePos + 1;
    const textBeforeEnd = node.getSourceFile().getFullText().slice(0, end);
    const endLineStart = textBeforeEnd.lastIndexOf('\n');
    const endCol = end - (endLineStart === -1 ? 0 : endLineStart + 1) + 1;
    if (
      (startLine < line || (startLine === line && startCol <= column)) &&
      (endLine > line || (endLine === line && endCol >= column))
    ) {
      if (d > depth) {
        deepest = node;
        depth = d;
      }
      for (const child of node.getChildren()) {
        walk(child, d + 1);
      }
    }
  };
  walk(sf, 0);
  if (!deepest) {
    throw new Error(`no node found at line ${line}, column ${column}`);
  }
  const node = deepest;
  const start = node.getStart();
  const end = node.getEnd();
  const startLinePos = node.getStartLinePos();
  const textBeforeEnd = node.getSourceFile().getFullText().slice(0, end);
  const endLineStart = textBeforeEnd.lastIndexOf('\n');
  return {
    node,
    kind: node.getKindName(),
    startLine: node.getStartLineNumber(),
    endLine: node.getEndLineNumber(),
    startColumn: start - startLinePos + 1,
    endColumn: end - (endLineStart === -1 ? 0 : endLineStart + 1) + 1,
    text: node.getText(),
  };
}

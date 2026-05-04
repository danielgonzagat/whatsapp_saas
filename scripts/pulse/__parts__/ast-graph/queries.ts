import type { AstCallGraph, AstResolvedSymbol } from '../../types.ast-graph';
import { normalizePath } from './path-utils';
import { buildAstCallGraph } from './graph-builder';

export function resolveSymbolAt(
  callGraph: AstCallGraph,
  filePath: string,
  line: number,
): AstResolvedSymbol | null {
  const normalized = normalizePath(filePath);
  return callGraph.symbols.find((s) => s.filePath === normalized && s.line === line) ?? null;
}

export const buildAstGraph = buildAstCallGraph;

export function resolveSymbol(
  callGraph: AstCallGraph,
  filePath: string,
  line: number,
): AstResolvedSymbol | null {
  return resolveSymbolAt(callGraph, filePath, line);
}

export function getCallChain(callGraph: AstCallGraph, startSymbolId: string): AstResolvedSymbol[] {
  const symbolMap = new Map(callGraph.symbols.map((s) => [s.id, s]));
  const outgoing = new Map<string, string[]>();
  for (const edge of callGraph.edges) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }

  const visited = new Set<string>();
  const chain: AstResolvedSymbol[] = [];

  function walk(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const symbol = symbolMap.get(id);
    if (symbol) chain.push(symbol);
    for (const target of outgoing.get(id) ?? []) {
      walk(target);
    }
  }

  walk(startSymbolId);
  return chain;
}

export function findCallers(callGraph: AstCallGraph, targetSymbolId: string): AstResolvedSymbol[] {
  const symbolMap = new Map(callGraph.symbols.map((s) => [s.id, s]));
  const callerIds = new Set<string>();

  for (const edge of callGraph.edges) {
    if (edge.to === targetSymbolId) {
      callerIds.add(edge.from);
    }
  }

  return [...callerIds]
    .map((id) => symbolMap.get(id))
    .filter((s): s is AstResolvedSymbol => s != null);
}

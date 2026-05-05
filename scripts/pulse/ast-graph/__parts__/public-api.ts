// PULSE — AST Graph Public API
// Symbol resolution, call chain traversal, artifact generation, and CLI entry point.

import * as path from 'path';
import type { AstCallGraph, AstResolvedSymbol } from '../../types.ast-graph';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import { buildAstCallGraph } from './call-graph';
import { normalizePath } from './core-utils';

export function resolveSymbolAt(
  callGraph: AstCallGraph,
  filePath: string,
  line: number,
): AstResolvedSymbol | null {
  const normalized = normalizePath(filePath);
  return callGraph.symbols.find((s) => s.filePath === normalized && s.line === line) ?? null;
}

/** Alias for {@link buildAstCallGraph}. */
export const buildAstGraph = buildAstCallGraph;

/** Alias for {@link resolveSymbolAt}. */
export function resolveSymbol(
  callGraph: AstCallGraph,
  filePath: string,
  line: number,
): AstResolvedSymbol | null {
  return resolveSymbolAt(callGraph, filePath, line);
}

/**
 * Traces the call chain starting from a given symbol ID.
 * Follows outgoing edges (calls-from) in BFS order, returning every
 * reachable symbol exactly once.
 */
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

/**
 * Finds all symbols that call the target symbol.
 * Reverse edge lookup across the call graph.
 */
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

/**
 * Builds the AST graph and writes `PULSE_AST_GRAPH.json` to
 * `.pulse/current/`. Returns the graph so the daemon can attach it
 * to its layer state summary.
 */
export async function generateAstGraph(rootDir: string): Promise<AstCallGraph> {
  const graph = await buildAstCallGraph(rootDir);

  const artifactDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(artifactDir, { recursive: true });
  writeTextFile(
    path.join(
      artifactDir,
      discoverAllObservedArtifactFilenames().astGraph ?? 'PULSE_AST_GRAPH.json',
    ),
    JSON.stringify(graph, null, 2),
  );

  console.warn(
    `[ast-graph] Wrote PULSE_AST_GRAPH.json — ${graph.summary.totalSymbols} symbols, ` +
      `${graph.summary.totalEdges} edges (${graph.summary.resolvedEdges} resolved)`,
  );

  return graph;
}

// ── CLI entry point ──

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  console.warn(`[ast-graph] Running standalone from ${projectRoot}`);
  generateAstGraph(projectRoot)
    .then(() => {
      console.warn('[ast-graph] Done.');
    })
    .catch((err) => {
      console.error('[ast-graph] Error:', err);
      process.exit(1);
    });
}

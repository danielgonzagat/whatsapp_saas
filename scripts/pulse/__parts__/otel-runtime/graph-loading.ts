import { safeJoin } from '../../safe-path';
import { pathExists, readJsonFile } from '../../safe-fs';
import type { PulseStructuralEdge, PulseStructuralGraph } from '../../types';
import type { AstCallGraph, AstCallEdge } from '../../types.ast-graph';

export interface AstGraphContext {
  edges: AstCallEdge[];
  symbols: Map<
    string,
    {
      name: string;
      kind: string;
      filePath: string;
      httpMethod?: string | null;
      routePath?: string | null;
    }
  >;
}

export interface StructuralGraphContext {
  edges: PulseStructuralEdge[];
  nodeFiles: Record<string, string>;
}

/**
 * Load the AST call graph from the canonical artifact directory.
 */
export function loadAstGraphContext(rootDir: string): AstGraphContext {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  const edges: AstCallEdge[] = [];
  const symbols = new Map<
    string,
    {
      name: string;
      kind: string;
      filePath: string;
      httpMethod?: string | null;
      routePath?: string | null;
    }
  >();

  try {
    const graphPath = safeJoin(currentDir, 'PULSE_AST_GRAPH.json');
    if (pathExists(graphPath)) {
      const graph = readJsonFile<AstCallGraph>(graphPath);
      edges.push(...graph.edges);
      for (const symbol of graph.symbols) {
        symbols.set(symbol.id, {
          name: symbol.name,
          kind: symbol.kind,
          filePath: symbol.filePath,
          httpMethod: symbol.httpMethod,
          routePath: symbol.routePath,
        });
      }
    }
  } catch {
    // AST graph not available
  }

  return { edges, symbols };
}

/**
 * Load structural graph context from the canonical artifact directory.
 */
export function loadStructuralGraphContext(rootDir: string): StructuralGraphContext {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  const edges: PulseStructuralEdge[] = [];
  const nodeFiles: Record<string, string> = {};

  try {
    const graphPath = safeJoin(currentDir, 'PULSE_STRUCTURAL_GRAPH.json');
    if (pathExists(graphPath)) {
      const graph = readJsonFile<PulseStructuralGraph>(graphPath);
      edges.push(...graph.edges);
      for (const node of graph.nodes) {
        nodeFiles[node.id] = node.file || '';
      }
    }
  } catch {
    // Structural graph not available — minimal data.
  }

  return { edges, nodeFiles };
}

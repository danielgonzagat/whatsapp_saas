import * as path from 'path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import type { AstCallGraph } from '../../types.ast-graph';
import { buildAstCallGraph } from './graph-builder';

export async function generateAstGraph(rootDir: string): Promise<AstCallGraph> {
  const graph = await buildAstCallGraph(rootDir);

  const artifactDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(artifactDir, { recursive: true });
  writeTextFile(path.join(artifactDir, 'PULSE_AST_GRAPH.json'), JSON.stringify(graph, null, 2));

  console.warn(
    `[ast-graph] Wrote PULSE_AST_GRAPH.json — ${graph.summary.totalSymbols} symbols, ` +
      `${graph.summary.totalEdges} edges (${graph.summary.resolvedEdges} resolved)`,
  );

  return graph;
}

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

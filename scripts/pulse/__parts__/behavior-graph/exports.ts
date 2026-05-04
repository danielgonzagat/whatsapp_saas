import * as path from 'path';
import type { BehaviorGraph, BehaviorNode, BehaviorRiskLevel } from '../../types.behavior-graph';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { buildBehaviorGraph } from './build';

function getCriticalPaths(graph: BehaviorGraph): BehaviorNode[] {
  return graph.nodes.filter(
    (n) => (n.risk === 'critical' || n.risk === 'high') && !n.hasErrorHandler,
  );
}

function getNodesWithoutObservability(graph: BehaviorGraph): BehaviorNode[] {
  return graph.nodes.filter((n) => !n.hasLogging && !n.hasMetrics && !n.hasTracing);
}

function generateBehaviorGraph(rootDir: string): BehaviorGraph {
  const graph = buildBehaviorGraph(rootDir);

  const artifactDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(artifactDir, { recursive: true });
  writeTextFile(
    path.join(artifactDir, 'PULSE_BEHAVIOR_GRAPH.json'),
    JSON.stringify(graph, null, 2),
  );

  console.warn(
    `[behavior-graph] Wrote PULSE_BEHAVIOR_GRAPH.json — ${graph.summary.totalNodes} nodes, ` +
      `${graph.summary.aiSafeNodes} ai_safe, ${graph.summary.humanRequiredNodes} governed blockers`,
  );

  return graph;
}

// ===== CLI entry point =====
if (process.env.PULSE_BEHAVIOR_GRAPH_RUN === '1' || require.main === module) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  console.warn(`[behavior-graph] Running standalone from ${projectRoot}`);
  const graph = generateBehaviorGraph(projectRoot);
  console.warn(`[behavior-graph] Done. Top 5 nodes by risk:`);
  const topRisks = graph.nodes
    .filter((n) => n.risk === 'critical' || n.risk === 'high')
    .sort((a, b) => {
      const order: Record<BehaviorRiskLevel, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        none: 4,
      };
      return order[a.risk] - order[b.risk];
    })
    .slice(0, 5);
  for (const node of topRisks) {
    console.warn(`  [${node.risk}] ${node.name} (${node.filePath}:${node.line})`);
  }
}

export { getCriticalPaths, getNodesWithoutObservability, generateBehaviorGraph };

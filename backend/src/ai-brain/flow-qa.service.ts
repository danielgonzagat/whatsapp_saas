import { Injectable } from '@nestjs/common';

@Injectable()
export class FlowQaService {
  testFlow(flowJson: any) {
    const report = {
      score: 100,
      issues: [] as string[],
      warnings: [] as string[],
      stats: {
        nodes: 0,
        deadEnds: 0,
        loops: 0,
      },
    };

    if (!flowJson || !flowJson.nodes || !flowJson.edges) {
      report.score = 0;
      report.issues.push('Invalid Flow JSON structure');
      return report;
    }

    const nodes = flowJson.nodes;
    const edges = flowJson.edges;
    report.stats.nodes = nodes.length;

    // 1. Check for Dead Ends (Nodes with no outgoing edges, except End nodes)
    nodes.forEach((node) => {
      if (node.type !== 'end') {
        const hasOutgoing = edges.some((e) => e.source === node.id);
        if (!hasOutgoing) {
          report.issues.push(
            `Node ${node.id} (${node.label || node.type}) is a dead end.`,
          );
          report.stats.deadEnds++;
          report.score -= 10;
        }
      }
    });

    // 2. Check for Orphan Nodes (Nodes with no incoming edges, except Start)
    nodes.forEach((node) => {
      if (node.type !== 'start') {
        const hasIncoming = edges.some((e) => e.target === node.id);
        if (!hasIncoming) {
          report.warnings.push(`Node ${node.id} is unreachable (orphan).`);
          report.score -= 5;
        }
      }
    });

    // 3. Check for Infinite Loops (Simple cycle detection - DFS)
    // (Simplified for MVP)

    // 4. Check for Missing Content
    nodes.forEach((node) => {
      if (node.data && !node.data.content && !node.data.media) {
        // Some nodes might not need content, but message nodes do
        if (node.type === 'message') {
          report.issues.push(`Node ${node.id} has empty content.`);
          report.score -= 10;
        }
      }
    });

    return report;
  }
}

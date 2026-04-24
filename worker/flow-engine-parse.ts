import type { FlowDefinition, FlowNode, RawFlowEdge, RawFlowNode } from './flow-engine.types';

/** Parse flow definition from raw node/edge arrays into a FlowDefinition. */
export function parseFlowDefinition(
  id: string,
  nodesArr: RawFlowNode[],
  edgesArr: RawFlowEdge[],
  workspaceId: string,
): FlowDefinition {
  const nodesMap: Record<string, FlowNode> = {};
  let startNodeId = '';

  // First pass: Create nodes
  for (const n of nodesArr) {
    nodesMap[n.id] = {
      id: n.id,
      type: n.type,
      data: n.data,
      next: null,
    };

    if (n.type === 'start' || !startNodeId) {
      startNodeId = n.id;
    }
  }

  // Second pass: Connect edges
  for (const e of edgesArr) {
    const source = nodesMap[e.source];
    if (!source) {
      continue;
    }

    if (e.sourceHandle === 'yes' || e.sourceHandle === 'true' || e.sourceHandle === 'replied') {
      source.yes = e.target;
    } else if (
      e.sourceHandle === 'no' ||
      e.sourceHandle === 'false' ||
      e.sourceHandle === 'timeout'
    ) {
      source.no = e.target;
    } else {
      source.next = e.target;
    }
  }

  return {
    id,
    name: 'Runtime Flow',
    nodes: nodesMap,
    startNode: startNodeId,
    workspaceId,
  };
}

/** Parse a timeout-member key back into { user, workspaceId? }. */
export function parseTimeoutMember(member: string): { user: string; workspaceId?: string } {
  const parts = member.split(':');
  if (parts.length >= 2) {
    const workspaceId = parts.shift() ?? '';
    const user = parts.join(':');
    return { user, workspaceId };
  }
  return { user: member };
}

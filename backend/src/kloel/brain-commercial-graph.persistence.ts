import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { CommercialGraphEdge, CommercialGraphNode } from './brain-commercial-graph.types';

type MindGraphNodeDelegate = {
  upsert(input: {
    where: { workspaceId_kind_label: { workspaceId: string; kind: string; label: string } };
    update: { weight: number; metadata: Prisma.InputJsonObject };
    create: {
      id: string;
      workspaceId: string;
      kind: string;
      label: string;
      weight: number;
      metadata: Prisma.InputJsonObject;
    };
  }): Promise<unknown>;
};

type MindGraphEdgeDelegate = {
  upsert(input: {
    where: {
      workspaceId_fromNode_relation_toNode: {
        workspaceId: string;
        fromNode: string;
        relation: string;
        toNode: string;
      };
    };
    update: { weight: number; samples: { increment: number }; metadata: Prisma.InputJsonObject };
    create: {
      id: string;
      workspaceId: string;
      fromNode: string;
      toNode: string;
      relation: string;
      weight: number;
      samples: number;
      metadata: Prisma.InputJsonObject;
    };
  }): Promise<unknown>;
};

function hasGraphDelegates(prisma: PrismaService): prisma is PrismaService & {
  mindGraphNode: MindGraphNodeDelegate;
  mindGraphEdge: MindGraphEdgeDelegate;
} {
  const candidate = Object(prisma) as {
    mindGraphEdge?: Partial<MindGraphEdgeDelegate>;
    mindGraphNode?: Partial<MindGraphNodeDelegate>;
  };
  return (
    typeof candidate.mindGraphNode?.upsert === 'function' &&
    typeof candidate.mindGraphEdge?.upsert === 'function'
  );
}

export async function persistWorkspaceCommercialGraph(
  prisma: PrismaService,
  workspaceId: string,
  nodes: Map<string, CommercialGraphNode>,
  edges: Map<string, CommercialGraphEdge>,
): Promise<void> {
  if (!hasGraphDelegates(prisma)) {
    return;
  }

  for (const node of nodes.values()) {
    await prisma.mindGraphNode.upsert({
      where: {
        workspaceId_kind_label: {
          workspaceId,
          kind: node.kind,
          label: node.label,
        },
      },
      update: {
        weight: node.weight,
        metadata: { graphId: node.id },
      },
      create: {
        id: node.id,
        workspaceId,
        kind: node.kind,
        label: node.label,
        weight: node.weight,
        metadata: { graphId: node.id },
      },
    });
  }

  for (const edge of edges.values()) {
    await prisma.mindGraphEdge.upsert({
      where: {
        workspaceId_fromNode_relation_toNode: {
          workspaceId,
          fromNode: edge.from,
          relation: edge.label,
          toNode: edge.to,
        },
      },
      update: {
        weight: edge.weight,
        samples: { increment: 1 },
        metadata: { source: 'brain_commercial_graph' },
      },
      create: {
        id: randomUUID(),
        workspaceId,
        fromNode: edge.from,
        toNode: edge.to,
        relation: edge.label,
        weight: edge.weight,
        samples: 1,
        metadata: { source: 'brain_commercial_graph' },
      },
    });
  }
}

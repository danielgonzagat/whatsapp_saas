import type { PulseStructuralGraph, PulseStructuralNode } from '../../types';

import { deriveUnitValue, deriveZeroValue } from '../../dynamic-reality-kernel';

export function structuralNode(overrides: Partial<PulseStructuralNode>): PulseStructuralNode {
  return {
    id: 'node:opaque',
    kind: 'backend_route',
    role: 'orchestration',
    truthMode: 'inferred',
    adapter: 'test',
    label: 'Opaque',
    file: 'backend/src/opaque/opaque.controller.ts',
    line: deriveUnitValue(),
    userFacing: true,
    runtimeCritical: false,
    protectedByGovernance: false,
    metadata: {},
    ...overrides,
  };
}

export function structuralGraph(nodes: PulseStructuralNode[]): PulseStructuralGraph {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalNodes: nodes.length,
      totalEdges: deriveUnitValue() + deriveUnitValue(),
      roleCounts: {
        interface: nodes.filter((node) => node.role === 'interface').length,
        orchestration: nodes.filter((node) => node.role === 'orchestration').length,
        persistence: nodes.filter((node) => node.role === 'persistence').length,
        side_effect: nodes.filter((node) => node.role === 'side_effect').length,
        simulation: deriveZeroValue(),
      },
      interfaceChains: deriveUnitValue(),
      completeChains: deriveUnitValue(),
      partialChains: deriveZeroValue(),
      simulatedChains: deriveZeroValue(),
    },
    nodes,
    edges: [
      {
        id: 'edge:ui-api',
        from: 'ui:opaque',
        to: 'api:opaque',
        kind: 'calls',
        truthMode: 'observed',
        evidence: 'test',
      },
      {
        id: 'edge:api-db',
        from: 'api:opaque',
        to: 'db:opaque',
        kind: 'persists',
        truthMode: 'observed',
        evidence: 'test',
      },
    ],
  };
}

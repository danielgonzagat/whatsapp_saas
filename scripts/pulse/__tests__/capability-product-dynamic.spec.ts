import { describe, expect, it } from 'vitest';

import { buildFlowProjection } from '../flow-projection';
import { buildProductModel } from '../product-model';
import type { PulseActorEvidence, PulseExecutionEvidence } from '../types';
import {
  actorEvidence,
  capabilityState,
  codebaseTruth,
  resolvedManifest,
  scopeState,
  structuralGraph,
  structuralNode,
} from './__parts__/capability-product-dynamic.fixtures';

describe('PULSE dynamic capability/product reconstruction', () => {
  it('derives product surfaces from scope and structural evidence without a fixed domain catalog', () => {
    const graph = structuralGraph([
      structuralNode({
        id: 'ui:opaque',
        kind: 'ui_element',
        role: 'interface',
        label: 'Opaque Button',
        file: 'frontend/src/app/opaque/page.tsx',
        metadata: { frontendPath: '/opaque' },
      }),
      structuralNode({
        id: 'api:opaque',
        label: 'Opaque Create',
        metadata: { endpoint: '/opaque/create' },
      }),
      structuralNode({
        id: 'db:opaque',
        kind: 'persistence_model',
        role: 'persistence',
        label: 'Opaque Record',
        file: 'backend/src/opaque/opaque.repository.ts',
      }),
    ]);

    const product = buildProductModel({
      structuralGraph: graph,
      scopeState: scopeState(),
      resolvedManifest: resolvedManifest(),
    });

    expect(product.surfaces.map((surface) => surface.id)).toContain('opaque');
    expect(product.capabilities.some((capability) => capability.surfaceId === 'opaque')).toBe(true);
    expect(product.surfaces.find((surface) => surface.id === 'opaque')?.description).toContain(
      '3 scoped file(s)',
    );
    expect(product.flows.map((flow) => flow.id)).toContain('flow-opaque-create');
    expect(
      product.flows.find((flow) => flow.id === 'flow-opaque-create')?.capabilities,
    ).toHaveLength(1);
  });

  it('uses a populated actor evidence bucket with scenario results when projecting flows', () => {
    const graph = structuralGraph([
      structuralNode({
        id: 'ui:opaque',
        kind: 'ui_element',
        role: 'interface',
        metadata: { frontendPath: '/opaque' },
      }),
      structuralNode({ id: 'api:opaque', metadata: { endpoint: '/opaque/create' } }),
      structuralNode({
        id: 'db:opaque',
        kind: 'persistence_model',
        role: 'persistence',
        metadata: {},
      }),
    ]);
    const executionEvidence: Partial<PulseExecutionEvidence> & Record<string, PulseActorEvidence> =
      {
        designer: actorEvidence(),
      };

    const projection = buildFlowProjection({
      structuralGraph: graph,
      capabilityState: capabilityState(),
      codebaseTruth: codebaseTruth(),
      resolvedManifest: resolvedManifest(),
      scopeState: scopeState(),
      executionEvidence,
    });

    expect(projection.flows).toHaveLength(1);
    expect(projection.flows[0].truthMode).toBe('observed');
    expect(projection.flows[0].evidenceSources).toContain('scenario-coverage');
  });
});

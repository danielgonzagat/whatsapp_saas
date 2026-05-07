/**
 * Graph-level invariants for the recommended flow templates: edge validity,
 * node-type consistency, and uniqueness constraints. Split from
 * `flow-template.recommended.spec.ts` to keep each spec file under the
 * architecture guardrail line cap.
 */

import {
  type RecommendedFlowTemplate,
  getRecommendedFlowTemplates,
} from './flow-template.recommended';
import {
  type FlowTemplateEndNode,
  type FlowTemplateStartNode,
  edgesOf,
  messageNodesOf,
  nodesOf,
} from './flow-template.recommended.spec.helpers';

describe('flow-template.recommended — graph invariants', () => {
  describe('edge structure — graph validity', () => {
    let templates: RecommendedFlowTemplate[];

    beforeEach(() => {
      templates = getRecommendedFlowTemplates();
    });

    it('should have valid edge IDs', () => {
      templates.forEach((template) => {
        edgesOf(template).forEach((edge) => {
          expect(edge).toHaveProperty('id');
          expect(edge).toHaveProperty('source');
          expect(edge).toHaveProperty('target');
        });
      });
    });

    it('should have all edges reference existing nodes', () => {
      templates.forEach((template) => {
        const nodeIds = nodesOf(template).map((n) => n.id);
        edgesOf(template).forEach((edge) => {
          expect(nodeIds).toContain(edge.source);
          expect(nodeIds).toContain(edge.target);
        });
      });
    });

    it('should form valid linear flow (no cycles)', () => {
      templates.forEach((template) => {
        const edges = edgesOf(template);
        const sources = edges.map((e) => e.source);
        const targets = edges.map((e) => e.target);
        // The `start` node is the entrypoint (no inbound edge), so exclude it
        // from the inbound-degree-of-1 assertion.
        sources
          .filter((source) => source !== 'start')
          .forEach((source) => {
            expect(targets.filter((t) => t === source)).toHaveLength(1);
          });
      });
    });

    it('should always start from start node', () => {
      templates.forEach((template) => {
        const firstEdge = edgesOf(template)[0];
        expect(firstEdge.source).toBe('start');
      });
    });

    it('should always end at end node', () => {
      templates.forEach((template) => {
        const lastEdge = edgesOf(template)[edgesOf(template).length - 1];
        expect(lastEdge.target).toBe('end');
      });
    });
  });

  describe('node structure — type consistency', () => {
    let templates: RecommendedFlowTemplate[];

    beforeEach(() => {
      templates = getRecommendedFlowTemplates();
    });

    it('should have valid node types', () => {
      const validTypes = ['start', 'end', 'message'];
      templates.forEach((template) => {
        nodesOf(template).forEach((node) => {
          expect(validTypes).toContain(node.type);
        });
      });
    });

    it('should have unique node IDs within template', () => {
      templates.forEach((template) => {
        const ids = nodesOf(template).map((n) => n.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      });
    });

    it('should have labels on all nodes', () => {
      templates.forEach((template) => {
        nodesOf(template).forEach((node) => {
          expect(node).toHaveProperty('label');
          expect(typeof node.label).toBe('string');
        });
      });
    });

    it('should have content on message nodes', () => {
      templates.forEach((template) => {
        messageNodesOf(template).forEach((node) => {
          expect(node).toHaveProperty('content');
          expect(typeof node.content).toBe('string');
          expect(node.content.length).toBeGreaterThan(0);
        });
      });
    });

    it('should not have content on start/end nodes', () => {
      templates.forEach((template) => {
        nodesOf(template)
          .filter(
            (n): n is FlowTemplateStartNode | FlowTemplateEndNode =>
              n.type === 'start' || n.type === 'end',
          )
          .forEach((node) => {
            expect((node as { content?: unknown }).content).toBeUndefined();
          });
      });
    });
  });
});

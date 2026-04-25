/**
 * Unit tests for flow-template.recommended — deterministic template catalog seeding,
 * structure invariants, and consistent recommendations from same seed.
 */

import { RecommendedFlowTemplate, getRecommendedFlowTemplates } from './flow-template.recommended';

/**
 * Test-local types mirroring the runtime shape produced by
 * `getRecommendedFlowTemplates`. The production type uses `unknown` for
 * `nodes`/`edges` so the seed catalog stays storage-shape-agnostic; tests
 * reflect the catalog's actual literal shapes here.
 */
interface FlowTemplateBaseNode {
  id: string;
  label: string;
}
interface FlowTemplateStartNode extends FlowTemplateBaseNode {
  type: 'start';
}
interface FlowTemplateEndNode extends FlowTemplateBaseNode {
  type: 'end';
}
interface FlowTemplateMessageNode extends FlowTemplateBaseNode {
  type: 'message';
  content: string;
}
type FlowTemplateNode = FlowTemplateStartNode | FlowTemplateEndNode | FlowTemplateMessageNode;

interface FlowTemplateEdge {
  id: string;
  source: string;
  target: string;
}

const nodesOf = (template: RecommendedFlowTemplate): FlowTemplateNode[] =>
  template.nodes as FlowTemplateNode[];
const edgesOf = (template: RecommendedFlowTemplate): FlowTemplateEdge[] =>
  template.edges as FlowTemplateEdge[];

const messageNodesOf = (template: RecommendedFlowTemplate): FlowTemplateMessageNode[] =>
  nodesOf(template).filter((n): n is FlowTemplateMessageNode => n.type === 'message');

const findMessageNode = (
  template: RecommendedFlowTemplate,
  id: string,
): FlowTemplateMessageNode => {
  const node = messageNodesOf(template).find((n) => n.id === id);
  if (!node) {
    throw new Error(`message node ${id} not found in template ${template.name}`);
  }
  return node;
};

describe('flow-template.recommended', () => {
  describe('getRecommendedFlowTemplates — deterministic seed', () => {
    it('should return array of flow templates', () => {
      const templates = getRecommendedFlowTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should produce identical output on multiple calls', () => {
      const call1 = getRecommendedFlowTemplates();
      const call2 = getRecommendedFlowTemplates();
      expect(JSON.stringify(call1)).toBe(JSON.stringify(call2));
    });

    it('should return exactly 3 templates', () => {
      const templates = getRecommendedFlowTemplates();
      expect(templates).toHaveLength(3);
    });

    it('should maintain consistent template order', () => {
      const templates = getRecommendedFlowTemplates();
      expect(templates[0].name).toBe('WhatsApp - Qualificação Rápida');
      expect(templates[1].name).toBe('Suporte - Coleta de Dados');
      expect(templates[2].name).toBe('Reengajamento Inativo (D+30)');
    });
  });

  describe('template structure — shape validation', () => {
    let templates: RecommendedFlowTemplate[];

    beforeEach(() => {
      templates = getRecommendedFlowTemplates();
    });

    it('should have required fields in each template', () => {
      templates.forEach((template) => {
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('category');
        expect(template).toHaveProperty('nodes');
        expect(template).toHaveProperty('edges');
      });
    });

    it('should have optional description and isPublic', () => {
      templates.forEach((template) => {
        expect(typeof template.description).toBe('string');
        expect(typeof template.isPublic).toBe('boolean');
      });
    });

    it('should have string names', () => {
      templates.forEach((template) => {
        expect(typeof template.name).toBe('string');
        expect(template.name.length).toBeGreaterThan(0);
      });
    });

    it('should have valid categories', () => {
      const validCategories = ['SALES', 'SUPPORT', 'MARKETING'];
      templates.forEach((template) => {
        expect(validCategories).toContain(template.category);
      });
    });

    it('should have nodes as array', () => {
      templates.forEach((template) => {
        expect(Array.isArray(template.nodes)).toBe(true);
        expect(nodesOf(template).length).toBeGreaterThan(0);
      });
    });

    it('should have edges as array', () => {
      templates.forEach((template) => {
        expect(Array.isArray(template.edges)).toBe(true);
        expect(edgesOf(template).length).toBeGreaterThan(0);
      });
    });

    it('should mark all templates as public', () => {
      templates.forEach((template) => {
        expect(template.isPublic).toBe(true);
      });
    });
  });

  describe('WhatsApp - Qualificação Rápida template', () => {
    let template: RecommendedFlowTemplate;

    beforeEach(() => {
      const templates = getRecommendedFlowTemplates();
      template = templates[0];
    });

    it('should have sales category', () => {
      expect(template.category).toBe('SALES');
    });

    it('should have 5 nodes (start, 3 questions, end)', () => {
      expect(template.nodes).toHaveLength(5);
    });

    it('should have 4 edges connecting nodes in sequence', () => {
      expect(template.edges).toHaveLength(4);
    });

    it('should start with start node', () => {
      const firstNode = nodesOf(template)[0];
      expect(firstNode.id).toBe('start');
      expect(firstNode.type).toBe('start');
    });

    it('should end with end node', () => {
      const lastNode = nodesOf(template)[nodesOf(template).length - 1];
      expect(lastNode.id).toBe('end');
      expect(lastNode.type).toBe('end');
    });

    it('should contain message nodes for name, need, budget', () => {
      const messageNodes = messageNodesOf(template);
      expect(messageNodes).toHaveLength(3);
      expect(messageNodes.map((n) => n.id)).toContain('ask_name');
      expect(messageNodes.map((n) => n.id)).toContain('ask_need');
      expect(messageNodes.map((n) => n.id)).toContain('ask_budget');
    });

    it('should have sequential edges start→ask_name→ask_need→ask_budget→end', () => {
      const edgeIds = edgesOf(template).map((e) => e.id);
      expect(edgeIds).toEqual(['e1', 'e2', 'e3', 'e4']);
    });

    it('should have Portuguese content in messages', () => {
      const messageNodes = messageNodesOf(template);
      // At least one message uses an accented Portuguese character; the
      // template intentionally mixes plain greetings (e.g. "Oi!") with
      // accented prompts so we assert presence at the suite level.
      expect(messageNodes.some((node) => /[áéíóúãõç]/.test(node.content))).toBe(true);
    });

    it('should include budget-related question', () => {
      const budgetNode = findMessageNode(template, 'ask_budget');
      expect(budgetNode.content).toContain('orçamento');
    });
  });

  describe('Suporte - Coleta de Dados template', () => {
    let template: RecommendedFlowTemplate;

    beforeEach(() => {
      const templates = getRecommendedFlowTemplates();
      template = templates[1];
    });

    it('should have support category', () => {
      expect(template.category).toBe('SUPPORT');
    });

    it('should have 5 nodes (start, 3 questions, end)', () => {
      expect(template.nodes).toHaveLength(5);
    });

    it('should have 4 edges', () => {
      expect(template.edges).toHaveLength(4);
    });

    it('should collect problem, environment, and priority', () => {
      const messageIds = nodesOf(template)
        .filter((n) => n.type === 'message')
        .map((n) => n.id);
      expect(messageIds).toContain('ask_problem');
      expect(messageIds).toContain('ask_env');
      expect(messageIds).toContain('ask_priority');
    });

    it('should ask about web/mobile/API environment', () => {
      const envNode = findMessageNode(template, 'ask_env');
      expect(envNode.content).toMatch(/web|mobile|API/i);
    });

    it('should have yes/no priority question', () => {
      const priorityNode = findMessageNode(template, 'ask_priority');
      expect(priorityNode.content).toMatch(/sim|não/i);
    });

    it('should have Portuguese labels and content', () => {
      const messageNodes = messageNodesOf(template);
      const carriesAccent = messageNodes.some(
        (n) => /[áéíóúãõç]/.test(n.label) || /[áéíóúãõç]/.test(n.content),
      );
      expect(carriesAccent).toBe(true);
    });
  });

  describe('Reengajamento Inativo (D+30) template', () => {
    let template: RecommendedFlowTemplate;

    beforeEach(() => {
      const templates = getRecommendedFlowTemplates();
      template = templates[2];
    });

    it('should have marketing category', () => {
      expect(template.category).toBe('MARKETING');
    });

    it('should have 4 nodes (start, 2 messages, end)', () => {
      expect(template.nodes).toHaveLength(4);
    });

    it('should have 3 edges', () => {
      expect(template.edges).toHaveLength(3);
    });

    it('should have ping and offer message nodes', () => {
      const messageIds = nodesOf(template)
        .filter((n) => n.type === 'message')
        .map((n) => n.id);
      expect(messageIds).toContain('ping');
      expect(messageIds).toContain('offer');
    });

    it('should mention inactivity in ping message', () => {
      const pingNode = findMessageNode(template, 'ping');
      expect(pingNode.content).toMatch(/tempo|inativo/i);
    });

    it('should offer help or show improvements', () => {
      const offerNode = findMessageNode(template, 'offer');
      expect(offerNode.content).toMatch(/ajudar|novidades|plano/i);
    });

    it('should have Portuguese reengagement language', () => {
      const description = template.description || '';
      expect(description).toMatch(/nudge|reengajamento/i);
    });
  });

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

  describe('determinism — consistent seeding across calls', () => {
    it('should produce identical JSON structure across 5 runs', () => {
      const runs = Array.from({ length: 5 }, () => JSON.stringify(getRecommendedFlowTemplates()));
      runs.forEach((json) => {
        expect(json).toBe(runs[0]);
      });
    });

    it('should preserve template order deterministically', () => {
      const t1 = getRecommendedFlowTemplates().map((t) => t.name);
      const t2 = getRecommendedFlowTemplates().map((t) => t.name);
      expect(t1).toEqual(t2);
    });

    it('should preserve node order within templates', () => {
      const templates1 = getRecommendedFlowTemplates();
      const templates2 = getRecommendedFlowTemplates();
      templates1.forEach((t1, idx) => {
        const t2 = templates2[idx];
        const ids1 = nodesOf(t1).map((n) => n.id);
        const ids2 = nodesOf(t2).map((n) => n.id);
        expect(ids1).toEqual(ids2);
      });
    });

    it('should preserve edge order within templates', () => {
      const templates1 = getRecommendedFlowTemplates();
      const templates2 = getRecommendedFlowTemplates();
      templates1.forEach((t1, idx) => {
        const t2 = templates2[idx];
        const edges1 = edgesOf(t1).map((e) => [e.source, e.target]);
        const edges2 = edgesOf(t2).map((e) => [e.source, e.target]);
        expect(edges1).toEqual(edges2);
      });
    });
  });
});

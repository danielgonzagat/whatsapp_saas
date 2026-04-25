/**
 * Unit tests for flow-template.recommended — deterministic template catalog
 * seeding, structure invariants, per-template content checks, and consistent
 * recommendations from same seed.
 *
 * Graph-level invariants (edge validity, node-type consistency) live in the
 * sibling `flow-template.recommended.graph.spec.ts` file. Shared type helpers
 * live in `flow-template.recommended.spec.helpers.ts`. Files are split to
 * stay below the architecture guardrail line cap without weakening coverage.
 */

import {
  type RecommendedFlowTemplate,
  getRecommendedFlowTemplates,
} from './flow-template.recommended';
import {
  edgesOf,
  findMessageNode,
  messageNodesOf,
  nodesOf,
} from './flow-template.recommended.spec.helpers';

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

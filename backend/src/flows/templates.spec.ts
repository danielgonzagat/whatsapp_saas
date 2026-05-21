import { FLOW_TEMPLATES } from './templates';

describe('FLOW_TEMPLATES legacy catalog', () => {
  it('is aligned to produtor + validacao + infoproduto + checkout_direto', () => {
    expect(FLOW_TEMPLATES).toHaveLength(3);

    FLOW_TEMPLATES.forEach((template) => {
      expect(template.market).toEqual({
        role: 'produtor',
        stage: 'validacao',
        businessType: 'infoproduto',
        flagshipJourney: 'checkout_direto',
      });
    });
  });

  it('keeps graph edges connected to declared nodes', () => {
    FLOW_TEMPLATES.forEach((template) => {
      const nodeIds = new Set(template.nodes.map((node) => node.id));

      expect(template.nodes[0]?.type).toBe('start');
      expect(template.edges.length).toBeGreaterThan(0);

      template.edges.forEach((edge) => {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      });
    });
  });

  it('uses active-market checkout language instead of generic demo placeholders', () => {
    const searchableText = FLOW_TEMPLATES.map((template) =>
      [
        template.id,
        template.name,
        template.description,
        ...template.nodes.map((node) => Object.values(node.data).join(' ')),
      ].join(' '),
    ).join(' ');

    expect(searchableText).toMatch(/produtor/i);
    expect(searchableText).toMatch(/infoproduto/i);
    expect(searchableText).toMatch(/checkout/i);
    expect(searchableText).not.toMatch(/cal\.com\/exemplo|GPT-4|R\$ 99\/mês/);
  });
});

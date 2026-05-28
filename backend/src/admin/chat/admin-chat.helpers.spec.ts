import { AdminChatRole } from '@prisma/client';
import {
  inferToolInvocation,
  parseToolInvocation,
  summarizeToolResult,
  toSessionView,
} from './admin-chat.helpers';describe('parseToolInvocation', () => {
  it('parses a /tool invocation with JSON args', () => {
    const result = parseToolInvocation('/tool searchWorkspaces {"query":"acme"}');
    expect(result).toEqual({ name: 'searchWorkspaces', args: { query: 'acme' } });
  });

  it('parses a /tool invocation without args', () => {
    const result = parseToolInvocation('/tool dashboardOverview');
    expect(result).toEqual({ name: 'dashboardOverview', args: {} });
  });

  it('parses a /tool invocation with trailing whitespace', () => {
    const result = parseToolInvocation('  /tool myTool  ');
    expect(result).toEqual({ name: 'myTool', args: {} });
  });

  it('returns null for non-tool content', () => {
    expect(parseToolInvocation('hello world')).toBeNull();
    expect(parseToolInvocation('/list')).toBeNull();
    expect(parseToolInvocation('buscar workspace acme')).toBeNull();
  });

  it('returns null for malformed JSON args', () => {
    expect(parseToolInvocation('/tool foo {invalid}')).toBeNull();
  });

  it('returns null when trailing content is not JSON object (array)', () => {
    // Regex requires content to end after optional {…} group,
    // so [1,2,3] does not satisfy $.
    const result = parseToolInvocation('/tool foo [1,2,3]');
    expect(result).toBeNull();
  });

  it('returns null when trailing content is non-JSON-object literal', () => {
    // null / true / 42 are valid JSON but the regex requires {…} syntax.
    const result = parseToolInvocation('/tool foo null');
    expect(result).toBeNull();
  });
});

describe('inferToolInvocation', () => {
  it('infers searchWorkspaces from explicit buscar phrase', () => {
    const result = inferToolInvocation('buscar workspace acme');
    expect(result).toEqual({ name: 'searchWorkspaces', args: { query: 'acme' } });
  });

  it('infers searchWorkspaces from procurar phrase', () => {
    const result = inferToolInvocation('procurar conta empresa-xyz');
    expect(result).toEqual({ name: 'searchWorkspaces', args: { query: 'empresa-xyz' } });
  });

  it('infers searchWorkspaces from contextual conta phrase', () => {
    const result = inferToolInvocation('conta exemplo');
    expect(result).toEqual({ name: 'searchWorkspaces', args: { query: 'exemplo' } });
  });

  it('rejects contextual phrase with too-short query', () => {
    const result = inferToolInvocation('workspace x');
    expect(result).toBeNull();
  });

  it('infers dashboardOverview for generic overview terms', () => {
    const result = inferToolInvocation('me mostra o dashboard');
    expect(result).toEqual({ name: 'dashboardOverview', args: {} });
  });

  it('dispatches to marketingOverview for marketing-related overview', () => {
    const result = inferToolInvocation('overview de marketing');
    expect(result).toEqual({ name: 'marketingOverview', args: {} });
  });

  it('dispatches to salesOverview for vendas-related overview', () => {
    const result = inferToolInvocation('resumo de vendas e pipeline');
    expect(result).toEqual({ name: 'salesOverview', args: {} });
  });

  it('dispatches to complianceOverview for chargeback terms', () => {
    const result = inferToolInvocation('dashboard de compliance e chargeback');
    expect(result).toEqual({ name: 'complianceOverview', args: {} });
  });

  it('dispatches to reportsOverview for relatório terms in overview context', () => {
    // Overview dispatch requires an overview keyword first.
    const result = inferToolInvocation('overview relatório de funnel');
    expect(result).toEqual({ name: 'reportsOverview', args: {} });
  });

  it('dispatches to configOverview for config terms', () => {
    const result = inferToolInvocation('home de configuração domínio');
    expect(result).toEqual({ name: 'configOverview', args: {} });
  });

  it('dispatches to supportOverview for suporte terms', () => {
    const result = inferToolInvocation('overview de suporte e ticket sla');
    expect(result).toEqual({ name: 'supportOverview', args: {} });
  });

  it('dispatches to notificationsOverview for alerta terms', () => {
    const result = inferToolInvocation('dashboard alerta notificações');
    expect(result).toEqual({ name: 'notificationsOverview', args: {} });
  });

  it('dispatches to productsOverview for produto terms', () => {
    const result = inferToolInvocation('resumo de produto');
    expect(result).toEqual({ name: 'productsOverview', args: {} });
  });

  it('dispatches to accountsOverview for conta terms in overview context', () => {
    const result = inferToolInvocation('overview de conta');
    expect(result).toEqual({ name: 'accountsOverview', args: {} });
  });

  it('dispatches to clientsOverview for cliente terms', () => {
    const result = inferToolInvocation('overview de cliente');
    expect(result).toEqual({ name: 'clientsOverview', args: {} });
  });

  it('favours search intent over overview when both match', () => {
    // "buscar conta dashboard" matches both search and overview;
    // inferToolInvocation tries search first.
    const result = inferToolInvocation('buscar conta dashboard');
    expect(result).toEqual({ name: 'searchWorkspaces', args: { query: 'dashboard' } });
  });

  it('returns null for unrelated content', () => {
    expect(inferToolInvocation('olá')).toBeNull();
    expect(inferToolInvocation('como vai')).toBeNull();
  });
});

describe('summarizeToolResult', () => {
  it('summarizes searchWorkspaces with items', () => {
    const result = summarizeToolResult('searchWorkspaces', {
      items: [
        { id: 'ws1', name: 'Acme Corp' },
        { id: 'ws2', name: 'Beta Inc' },
      ],
    });
    expect(result).toContain('Encontrei 2 workspace(s)');
    expect(result).toContain('- Acme Corp (ws1)');
    expect(result).toContain('- Beta Inc (ws2)');
  });

  it('summarizes empty searchWorkspaces', () => {
    const result = summarizeToolResult('searchWorkspaces', { items: [] });
    expect(result).toBe('Nenhuma workspace encontrada para o termo informado.');
  });

  it('handles searchWorkspaces with non-array items gracefully', () => {
    const result = summarizeToolResult('searchWorkspaces', { items: 'not-array' });
    expect(result).toBe('Nenhuma workspace encontrada para o termo informado.');
  });

  it('truncates items to 5', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `ws${i}`, name: `Workspace ${i}` }));
    const result = summarizeToolResult('searchWorkspaces', { items });
    expect(result).toContain('Encontrei 10 workspace(s)');
    // Only 5 items rendered.
    const lines = result.split('\n');
    expect(lines.filter((l) => l.startsWith('- '))).toHaveLength(5);
  });

  it('falls back to JSON preview for non-searchWorkspaces tools', () => {
    const result = summarizeToolResult('otherTool', { foo: 'bar', baz: 42 });
    expect(result).toContain('"foo"');
    expect(result).toContain('"bar"');
    expect(result).toContain('42');
  });

  it('truncates long JSON preview at 1800 characters', () => {
    const longValue = 'x'.repeat(500);
    const big = { data: Array.from({ length: 10 }, () => longValue) };
    const result = summarizeToolResult('otherTool', big);
    expect(result.length).toBeLessThanOrEqual(1801); // 1800 + '…'
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('toSessionView', () => {
  const sampleSession = {
    id: 's1',
    title: 'Test session',
    createdAt: new Date('2026-05-10T12:00:00Z'),
    lastUsedAt: new Date('2026-05-10T13:00:00Z'),
    expiresAt: new Date('2026-05-11T12:00:00Z'),
    messages: [
      {
        id: 'm1',
        role: AdminChatRole.USER,
        content: 'hello',
        toolName: null,
        toolArgs: null,
        toolResult: null,
        createdAt: new Date('2026-05-10T12:00:01Z'),
      },
      {
        id: 'm2',
        role: AdminChatRole.TOOL,
        content: 'searchWorkspaces',
        toolName: 'searchWorkspaces',
        toolArgs: { query: 'acme' },
        toolResult: { items: [{ id: 'ws1', name: 'Acme' }] },
        createdAt: new Date('2026-05-10T12:00:02Z'),
      },
    ],
  };

  it('maps session fields to ISO string DTO', () => {
    const view = toSessionView(sampleSession);
    expect(view.id).toBe('s1');
    expect(view.title).toBe('Test session');
    expect(view.createdAt).toBe('2026-05-10T12:00:00.000Z');
    expect(view.lastUsedAt).toBe('2026-05-10T13:00:00.000Z');
    expect(view.expiresAt).toBe('2026-05-11T12:00:00.000Z');
  });

  it('maps messages with proper role and null defaults', () => {
    const view = toSessionView(sampleSession);
    expect(view.messages).toHaveLength(2);

    const [msg1, msg2] = view.messages;
    expect(msg1.role).toBe(AdminChatRole.USER);
    expect(msg1.content).toBe('hello');
    expect(msg1.toolName).toBeNull();
    expect(msg1.toolArgs).toBeNull();
    expect(msg1.toolResult).toBeNull();

    expect(msg2.role).toBe(AdminChatRole.TOOL);
    expect(msg2.toolName).toBe('searchWorkspaces');
    expect(msg2.toolArgs).toEqual({ query: 'acme' });
    expect(msg2.toolResult).toEqual({ items: [{ id: 'ws1', name: 'Acme' }] });
  });

  it('handles null title', () => {
    const view = toSessionView({ ...sampleSession, title: null });
    expect(view.title).toBeNull();
  });

  it('handles empty messages', () => {
    const view = toSessionView({ ...sampleSession, messages: [] });
    expect(view.messages).toHaveLength(0);
  });
});
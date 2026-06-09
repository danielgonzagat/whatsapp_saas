import {
  buildObserveInsights,
  buildOperatorResponseText,
  buildPredecidedActions,
  buildStreamEvents,
  cloneJson,
  latestUserText,
  readOptionalString,
  readRecord,
  resolveDecideMessage,
} from './mind-runtime.helpers';

describe('mind-runtime helpers', () => {
  describe('latestUserText', () => {
    it('returns undefined for empty or missing message list', () => {
      expect(latestUserText(undefined)).toBeUndefined();
      expect(latestUserText([])).toBeUndefined();
    });

    it('picks the most recent user message with trimmed non-empty content', () => {
      expect(
        latestUserText([
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'mid' },
          { role: 'user', content: 'latest' },
          { role: 'system', content: 'sys' },
        ]),
      ).toBe('latest');
    });

    it('skips assistant/system turns and empty user content', () => {
      expect(
        latestUserText([
          { role: 'user', content: 'kept' },
          { role: 'user', content: '   ' },
          { role: 'assistant', content: 'no' },
        ]),
      ).toBe('kept');
    });
  });

  describe('readOptionalString', () => {
    it('returns trimmed string when non-empty', () => {
      expect(readOptionalString('  hi  ')).toBe('hi');
    });

    it('returns undefined for non-strings or empty/whitespace input', () => {
      expect(readOptionalString('')).toBeUndefined();
      expect(readOptionalString('   ')).toBeUndefined();
      expect(readOptionalString(null)).toBeUndefined();
      expect(readOptionalString(42)).toBeUndefined();
      expect(readOptionalString({})).toBeUndefined();
    });
  });

  describe('cloneJson', () => {
    it('produces a structurally independent deep clone', () => {
      const original = { nested: { array: [1, 2, { deep: 'value' }] } };
      const cloned = cloneJson(original) as typeof original;
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.nested).not.toBe(original.nested);
      expect(cloned.nested.array).not.toBe(original.nested.array);
    });
  });

  describe('readRecord', () => {
    it('returns the object when it is a plain record', () => {
      const obj = { a: 1 };
      expect(readRecord(obj)).toBe(obj);
    });

    it('returns an empty object for arrays, null, or primitives', () => {
      expect(readRecord([1, 2])).toEqual({});
      expect(readRecord(null)).toEqual({});
      expect(readRecord(undefined)).toEqual({});
      expect(readRecord('x')).toEqual({});
    });
  });

  describe('buildPredecidedActions', () => {
    it('returns empty when intent is not in the allow-list', () => {
      expect(
        buildPredecidedActions({
          allowedTools: ['list_products'],
          intent: 'forbidden',
        }),
      ).toEqual([]);
    });

    it('emits a predecided action carrying actionArgs when present', () => {
      expect(
        buildPredecidedActions({
          allowedTools: ['create_product'],
          intent: 'create_product',
          context: { actionArgs: { name: 'X' } },
        }),
      ).toEqual([{ tool: 'create_product', args: { name: 'X' } }]);
    });

    it('falls back to toolArgs when actionArgs is missing', () => {
      expect(
        buildPredecidedActions({
          allowedTools: ['create_product'],
          intent: 'create_product',
          context: { toolArgs: { sku: 'A' } },
        }),
      ).toEqual([{ tool: 'create_product', args: { sku: 'A' } }]);
    });

    it('emits empty args when neither field is provided', () => {
      expect(
        buildPredecidedActions({
          allowedTools: ['create_product'],
          intent: 'create_product',
        }),
      ).toEqual([{ tool: 'create_product', args: {} }]);
    });
  });

  describe('resolveDecideMessage', () => {
    it('prefers the latest user turn when messages are present', () => {
      const result = resolveDecideMessage({
        messages: [{ role: 'user', content: 'hello' }],
        context: { message: 'ignored' },
        intent: 'user_message',
      });
      expect(result).toBe('hello');
    });

    it('falls back to context.message when no user turn exists', () => {
      const result = resolveDecideMessage({
        messages: [{ role: 'assistant', content: 'hi' }],
        context: { message: 'from-context' },
        intent: 'user_message',
      });
      expect(result).toBe('from-context');
    });

    it('falls back to intent when neither messages nor context.message are usable', () => {
      const result = resolveDecideMessage({
        intent: 'fallback_intent',
      });
      expect(result).toBe('fallback_intent');
    });

    it('falls back to the literal user_message when nothing is provided', () => {
      const result = resolveDecideMessage({});
      expect(result).toBe('user_message');
    });
  });

  describe('buildOperatorResponseText', () => {
    it('summarizes product catalog results without leaking the operator intent', () => {
      const input = {
        intent: 'list_products',
        ok: true,
        result: [{ name: 'PDRN Coreamy', price: 197, active: true }],
      };

      const result = buildOperatorResponseText(input);

      expect(result).toContain('Consultei seu catálogo real');
      expect(result).toContain('PDRN Coreamy');
      expect(result).toContain('R$ 197,00');
      expect(result).not.toContain('list_products');
      expect(result).not.toContain('Acao');
    });

    it('explains an empty product catalog as a real observation', () => {
      const input = {
        intent: 'list_products',
        ok: true,
        result: [] as unknown[],
      };

      expect(buildOperatorResponseText(input)).toBe(
        'Consultei seu catálogo real e não encontrei produtos cadastrados neste workspace.',
      );
    });

    it('formats a failure line with the error message', () => {
      expect(
        buildOperatorResponseText({
          intent: 'list_products',
          ok: false,
          error: 'workspace_required',
        }),
      ).toBe('Falha ao executar list_products: workspace_required.');
    });

    it('uses the default error message when no error is supplied', () => {
      expect(
        buildOperatorResponseText({
          intent: 'safe_query',
          ok: false,
        }),
      ).toBe('Falha ao executar safe_query: erro desconhecido.');
    });
  });

  describe('buildStreamEvents', () => {
    it('emits status → thread → tool_result → content → done sequence', () => {
      const events = buildStreamEvents({
        actions: [{ tool: 'create_product', result: { id: 'p-1' } }],
        conversationId: 'thread-1',
        title: 'My thread',
        response: 'Produto criado.',
      });

      expect(events[0]).toMatchObject({ type: 'status', phase: 'thinking' });
      expect(events[1]).toMatchObject({
        type: 'thread',
        conversationId: 'thread-1',
        title: 'My thread',
      });
      expect(events[2]).toMatchObject({
        type: 'tool_result',
        tool: 'create_product',
        result: { id: 'p-1' },
        success: true,
      });
      expect(events[3]).toMatchObject({ type: 'content', content: 'Produto criado.' });
      expect(events[4]).toMatchObject({ type: 'done', done: true });
    });

    it('skips the thread event when no conversationId is set', () => {
      const events = buildStreamEvents({
        actions: [],
        response: 'ok',
      });
      expect(events.some((e) => e.type === 'thread')).toBe(false);
    });

    it('falls back to a default response and brain_action tool name', () => {
      const events = buildStreamEvents({
        actions: [{ noTool: true }],
      });
      expect(events.find((e) => e.type === 'tool_result')).toMatchObject({
        tool: 'brain_action',
        success: true,
      });
      expect(events.find((e) => e.type === 'content')).toMatchObject({
        content: 'Ação processada pelo Kloel Brain.',
      });
    });

    it('ignores non-object actions', () => {
      const events = buildStreamEvents({ actions: [null, 'string', 123, { tool: 'ok' }] });
      const toolEvents = events.filter((e) => e.type === 'tool_result');
      expect(toolEvents).toHaveLength(1);
    });
  });

  describe('buildObserveInsights', () => {
    it('returns the top 3 recommendations formatted with rounded confidence', () => {
      const insights = buildObserveInsights([
        { action: 'create_product', confidence: 0.913, reason: 'Boost SKU coverage' },
        { action: 'open_inbox', confidence: 0.5, reason: 'Unread messages' },
        { action: 'review_kpis', confidence: 0.121, reason: 'KPI drift' },
        { action: 'extra', confidence: 0.99, reason: 'should be sliced off' },
      ]);
      expect(insights).toEqual([
        'create_product: 91% confidence. Boost SKU coverage',
        'open_inbox: 50% confidence. Unread messages',
        'review_kpis: 12% confidence. KPI drift',
      ]);
    });

    it('returns an empty list when no recommendations are provided', () => {
      expect(buildObserveInsights([])).toEqual([]);
    });
  });
});

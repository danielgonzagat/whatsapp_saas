import { describe, expect, it } from 'vitest';
import {
  appendAssistantTraceFromEvent,
  getAssistantProcessingTrace,
  getAssistantReasoning,
  getAssistantResponseVersions,
  summarizeAssistantProcessingTrace,
} from '../kloel-message-ui';

describe('kloel-message-ui trace', () => {
  it('builds a durable processing trace and summary from stream events', () => {
    const withThinking = appendAssistantTraceFromEvent(undefined, {
      type: 'status',
      phase: 'thinking',
      label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
    });
    const withToolCall = appendAssistantTraceFromEvent(withThinking, {
      type: 'tool_call',
      tool: 'search_web',
      callId: 'call-1',
      spanId: 'span-1',
    });
    const withToolResult = appendAssistantTraceFromEvent(withToolCall, {
      type: 'tool_result',
      tool: 'search_web',
      callId: 'call-1',
      spanId: 'span-1',
      success: true,
      result: { answer: 'ok' },
      artifactId: 'artifact-1',
      durationMs: 42,
    });

    const entries = getAssistantProcessingTrace(withToolResult);

    expect(entries).toEqual([
      expect.objectContaining({
        phase: 'thinking',
        label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
      }),
      expect.objectContaining({
        phase: 'tool_calling',
        label: 'Consultei search_web antes de responder.',
        tool: 'search_web',
        spanId: 'span-1',
      }),
      expect.objectContaining({
        phase: 'tool_result',
        label: 'Incorporei as observações de search_web antes de responder.',
        tool: 'search_web',
        spanId: 'span-1',
        artifactId: 'artifact-1',
        durationMs: 42,
      }),
    ]);
    expect(summarizeAssistantProcessingTrace(entries)).toBe(
      'Entendendo sua pergunta e reunindo o contexto da conversa, consultei search_web antes de responder e incorporei as observações de search_web antes de responder.',
    );
  });

  it('preserves rich file stream fields for editable artifacts', () => {
    const withFile = appendAssistantTraceFromEvent(undefined, {
      type: 'file',
      name: 'contador.html',
      meta: 'HTML interativo',
      url: 'artifact://artifact-contador-1',
      downloadUrl: 'data:text/html;base64,PGgxPk9rPC9oMT4=',
      artifactId: 'artifact-contador-1',
      kind: 'html',
      content: '<h1>Ok</h1>',
      contentRef: 'artifact://artifact-contador-1/content',
      editable: true,
      persistent: true,
    });

    expect(getAssistantReasoning(withFile).files).toEqual([
      {
        name: 'contador.html',
        meta: 'HTML interativo',
        url: 'artifact://artifact-contador-1',
        downloadUrl: 'data:text/html;base64,PGgxPk9rPC9oMT4=',
        artifactId: 'artifact-contador-1',
        kind: 'html',
        content: '<h1>Ok</h1>',
        contentRef: 'artifact://artifact-contador-1/content',
        editable: true,
        persistent: true,
      },
    ]);
  });

  it('ignores malformed metadata entries and still falls back safely', () => {
    expect(
      getAssistantResponseVersions(
        {
          responseVersions: [
            null,
            { id: 'broken' },
            { content: 'Versão válida', source: 'initial' },
          ],
        },
        'Resposta atual',
        'message-1',
      ),
    ).toEqual([
      expect.objectContaining({
        content: 'Versão válida',
        source: 'initial',
      }),
    ]);

    expect(
      getAssistantProcessingTrace({
        processingTrace: [
          { foo: 'bar' },
          { label: 'Executando search web.', phase: 'tool_calling' },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        label: 'Consultei contexto operacional relevante antes de responder.',
        phase: 'tool_calling',
      }),
    ]);
  });

  it('deduplicates repeated processing events instead of bloating persisted trace history', () => {
    const first = appendAssistantTraceFromEvent(undefined, {
      type: 'status',
      phase: 'thinking',
      label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
    });
    const second = appendAssistantTraceFromEvent(first, {
      type: 'status',
      phase: 'thinking',
      label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
    });

    expect(getAssistantProcessingTrace(second)).toHaveLength(1);
  });

  it('keeps live tool call and tool result trace ids distinct for React rendering', () => {
    const withToolCall = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'search_web',
      callId: 'call-1',
    });
    const withToolResult = appendAssistantTraceFromEvent(withToolCall, {
      type: 'tool_result',
      tool: 'search_web',
      callId: 'call-1',
      success: true,
      result: { ok: true },
    });

    expect(getAssistantProcessingTrace(withToolResult).map((entry) => entry.id)).toEqual([
      'call-1:call',
      'call-1:result',
    ]);
  });

  it('keeps public code tool names in trace entries', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'code_outline',
      callId: 'call-code',
    });
    const entry = getAssistantProcessingTrace(metadata)[0];

    expect(entry?.label).toBe('Consultei code_outline antes de responder.');
    expect(entry?.tool).toBe('code_outline');
    expect(JSON.stringify(entry)).toContain('code_outline');
  });

  it('keeps public backend validation tool names in trace entries', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'run_backend_tests',
      callId: 'call-tests',
    });
    const entry = getAssistantProcessingTrace(metadata)[0];

    expect(entry?.label).toBe('Consultei run_backend_tests antes de responder.');
    expect(entry?.tool).toBe('run_backend_tests');
    expect(JSON.stringify(entry)).toContain('run_backend_tests');
  });

  it('keeps public composer capability tool names in trace entries', () => {
    const withSite = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'create_site',
      callId: 'call-site',
    });
    const withImage = appendAssistantTraceFromEvent(withSite, {
      type: 'tool_result',
      tool: 'create_image',
      callId: 'call-image',
      success: false,
      error: 'provider missing',
    });

    const trace = getAssistantProcessingTrace(withImage);
    expect(trace.map((entry) => entry.label)).toEqual([
      'Consultei create_site antes de responder.',
      'Registrei uma limitação ao usar create_image antes de responder.',
    ]);
    expect(trace.map((entry) => entry.tool)).toEqual(['create_site', 'create_image']);
    expect(JSON.stringify(trace)).toContain('create_site');
    expect(JSON.stringify(trace)).toContain('create_image');
  });

  it('keeps public commerce and workspace tool names in trace entries', () => {
    const withProducts = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'list_products',
      callId: 'call-products',
    });
    const withSettings = appendAssistantTraceFromEvent(withProducts, {
      type: 'tool_result',
      tool: 'get_settings',
      callId: 'call-settings',
      success: true,
      result: {},
    });
    const withBilling = appendAssistantTraceFromEvent(withSettings, {
      type: 'tool_result',
      tool: 'get_billing_status',
      callId: 'call-billing',
      success: true,
      result: {},
    });
    const withHealth = appendAssistantTraceFromEvent(withBilling, {
      type: 'tool_call',
      tool: 'self.health',
      callId: 'call-health',
    });

    const trace = getAssistantProcessingTrace(withHealth);
    expect(trace.map((entry) => entry.label)).toEqual([
      'Consultei list_products antes de responder.',
      'Incorporei as observações de get_settings antes de responder.',
      'Incorporei as observações de get_billing_status antes de responder.',
      'Consultei self.health antes de responder.',
    ]);
    expect(trace.map((entry) => entry.tool)).toEqual([
      'list_products',
      'get_settings',
      'get_billing_status',
      'self.health',
    ]);
    expect(JSON.stringify(trace)).toContain('list_products');
    expect(JSON.stringify(trace)).toContain('get_settings');
    expect(JSON.stringify(trace)).toContain('get_billing_status');
    expect(JSON.stringify(trace)).toContain('self.health');
  });

  it('redacts raw executable identifiers in persisted status trace labels', () => {
    const trace = getAssistantProcessingTrace({
      processingTrace: [
        {
          id: 'trace-legacy-code',
          kind: 'status',
          phase: 'tool_calling',
          label: 'Executando code_outline, executando code outline e concluiu code outline.',
        },
      ],
    });

    expect(trace[0]?.label).toBe('Consultei contexto operacional relevante antes de responder.');
    expect(trace[0]?.label).not.toContain('code_outline');
    expect(trace[0]?.label).not.toContain('code outline');
  });

  it('redacts legacy tool-shaped persisted status trace labels', () => {
    const trace = getAssistantProcessingTrace({
      processingTrace: [
        {
          id: 'trace-legacy-products',
          kind: 'status',
          phase: 'tool_calling',
          label:
            'Ação enviada para list products. Observação recebida de get settings. Observação recebida de get billing status.',
        },
      ],
    });

    expect(trace[0]?.label).toBe('Consultei contexto operacional relevante antes de responder.');
    expect(trace[0]?.label).not.toContain('list products');
    expect(trace[0]?.label).not.toContain('get settings');
    expect(trace[0]?.label).not.toContain('get billing status');
  });

  it('keeps persisted sales trace tool names from legacy executable traces', () => {
    const trace = getAssistantProcessingTrace({
      processingTrace: [
        {
          id: 'trace-sales-call',
          kind: 'tool_call',
          phase: 'tool_calling',
          label: 'Ação enviada para get order details.',
          tool: 'get_order_details',
        },
        {
          id: 'trace-sales-result',
          kind: 'tool_result',
          phase: 'tool_result',
          label: 'Falha observada em get order details.',
          tool: 'get_order_details',
          success: false,
        },
      ],
    });

    expect(trace.map((entry) => entry.label)).toEqual([
      'Consultei contexto operacional relevante antes de responder.',
      'Registrei uma limitação operacional antes de responder.',
    ]);
    expect(trace.map((entry) => entry.tool)).toEqual(['get_order_details', 'get_order_details']);
    expect(JSON.stringify(trace)).toContain('get_order_details');
  });

  it('redacts raw executable identifiers in persisted processing summaries', () => {
    const summary = summarizeAssistantProcessingTrace(
      [],
      'Executando code_outline, executando code outline e concluiu code outline.',
    );

    expect(summary).toBe('Consultei contexto operacional relevante antes de responder.');
    expect(summary).not.toContain('code_outline');
  });

  it('ignores tool status events when typed tool events provide the executable trace', () => {
    const withToolStatus = appendAssistantTraceFromEvent(undefined, {
      type: 'status',
      phase: 'tool_calling',
      label: 'Executando search web.',
    });
    const withToolCall = appendAssistantTraceFromEvent(withToolStatus, {
      type: 'tool_call',
      tool: 'search_web',
      callId: 'call-1',
    });

    expect(getAssistantProcessingTrace(withToolCall)).toEqual([
      expect.objectContaining({
        kind: 'tool_call',
        label: 'Consultei search_web antes de responder.',
        tool: 'search_web',
      }),
    ]);
  });

  it('labels refinement traces with public tool names', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'refine_response',
      callId: 'call-refine',
    });

    expect(getAssistantProcessingTrace(metadata)).toEqual([
      expect.objectContaining({
        kind: 'tool_call',
        label: 'Consultei refine_response antes de responder.',
        tool: 'refine_response',
      }),
    ]);
  });

  it('keeps unknown executable tool ids public in trace chips', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'delete_user_secret_records',
      callId: 'call-danger',
    });

    const [entry] = getAssistantProcessingTrace(metadata);

    expect(entry?.label).toBe('Consultei delete_user_secret_records antes de responder.');
    expect(entry?.tool).toBe('delete_user_secret_records');
    expect(JSON.stringify(entry)).toContain('delete_user_secret_records');
  });

  it('tracks streamed reasoning deltas as public thinking text with timing metadata', () => {
    const first = appendAssistantTraceFromEvent(
      { clientRequestId: 'req-live-reasoning' },
      {
        type: 'reasoning_delta',
        text: 'Analisando ',
      },
    );
    const second = appendAssistantTraceFromEvent(first, {
      type: 'reasoning_delta',
      text: 'os dados da conta.',
    });

    expect(second).toEqual(
      expect.objectContaining({
        clientRequestId: 'req-live-reasoning',
        reasoningStartedAt: expect.any(Number),
        reasoningText: 'Analisando os dados da conta.',
      }),
    );
    expect(getAssistantReasoning(second).text).toBe('Analisando os dados da conta.');
  });

  it('redacts streamed reasoning with private runtime prompt markers', () => {
    const metadata = appendAssistantTraceFromEvent(
      { clientRequestId: 'req-live-reasoning-private' },
      {
        type: 'reasoning_delta',
        text: 'O runtime context inclui system prompt e developer prompt.',
      },
    );

    const reasoning = getAssistantReasoning(metadata);

    expect(metadata).toHaveProperty(
      'reasoningText',
      'Detalhes internos desta execução foram omitidos com segurança.',
    );
    expect(reasoning.text).toBe('Detalhes internos desta execução foram omitidos com segurança.');
    expect(reasoning.text).not.toContain('runtime context');
    expect(reasoning.text).not.toContain('system prompt');
    expect(reasoning.text).not.toContain('developer prompt');
  });

  it('keeps public raw reasoning and tool names visible in streamed reasoning', () => {
    const publicText =
      'chain-of-thought bruto: usei inspect_self e tool_call search_web antes de responder.';
    const metadata = appendAssistantTraceFromEvent(
      { clientRequestId: 'req-live-reasoning-public' },
      {
        type: 'reasoning_delta',
        text: publicText,
      },
    );

    const reasoning = getAssistantReasoning(metadata);

    expect(metadata).toHaveProperty('reasoningText', publicText);
    expect(reasoning.text).toBe(publicText);
    expect(reasoning.text).toContain('inspect_self');
    expect(reasoning.text).toContain('tool_call search_web');
  });

  it('renders persisted reasoningText as public thinking text and redacts private markers', () => {
    expect(getAssistantReasoning({ reasoningText: 'legacy provider reasoning' }).text).toBe(
      'legacy provider reasoning',
    );
    expect(getAssistantReasoning({ reasoningText: 'token sk-live-secret' }).text).toBe(
      'Detalhes internos desta execução foram omitidos com segurança.',
    );
    expect(getAssistantReasoning({ reasoningText: 'Vou usar skill=artifact.' }).text).toBe(
      'Detalhes internos desta execução foram omitidos com segurança.',
    );
    expect(getAssistantReasoning({ reasoningText: 'system prompt: resposta interna.' }).text).toBe(
      'Detalhes internos desta execução foram omitidos com segurança.',
    );
    expect(getAssistantReasoning({ reasoningText: 'Vou usar tool_call search_web e inspect_self.' }).text).toBe(
      'Vou usar tool_call search_web e inspect_self.',
    );
    expect(
      getAssistantReasoning({
        reasoningText:
          'Probably not needed. I will craft a direct reply, then I will output the final message.',
      }).text,
    ).toBe('Probably not needed. I will craft a direct reply, then I will output the final message.');
  });

  it('derives a real reasoning duration when the provider reports a non-positive value', () => {
    const started = appendAssistantTraceFromEvent(
      { clientRequestId: 'req-duration' },
      { type: 'reasoning_delta', text: 'Pensando.' },
    );
    const done = appendAssistantTraceFromEvent(started, {
      type: 'reasoning_done',
      durationMs: 0,
    });

    expect(getAssistantReasoning(done).durationMs).not.toBeNull();
    expect(getAssistantReasoning(done).durationMs ?? -1).toBeGreaterThanOrEqual(0);
  });

  it('prefers the provider-reported reasoning duration when it is positive', () => {
    const done = appendAssistantTraceFromEvent(
      { clientRequestId: 'req-duration-positive' },
      { type: 'reasoning_done', durationMs: 1500 },
    );

    expect(getAssistantReasoning(done).durationMs).toBe(1500);
  });

  it('merges live capability metadata from terminal stream events', () => {
    const metadata = appendAssistantTraceFromEvent(
      { clientRequestId: 'req-1' },
      {
        type: 'done',
        metadata: {
          capability: 'create_image',
          generatedImageUrl: 'https://cdn.example.test/generated.png',
        },
      },
    );

    expect(metadata).toEqual(
      expect.objectContaining({
        clientRequestId: 'req-1',
        capability: 'create_image',
        generatedImageUrl: 'https://cdn.example.test/generated.png',
      }),
    );
    expect(getAssistantProcessingTrace(metadata)).toEqual([]);
  });
});

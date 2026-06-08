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
        label: 'Consultei contexto operacional relevante antes de responder.',
        spanId: 'span-1',
      }),
      expect.objectContaining({
        phase: 'tool_result',
        label: 'Incorporei as observações encontradas antes de responder.',
        spanId: 'span-1',
        artifactId: 'artifact-1',
        durationMs: 42,
      }),
    ]);
    expect(summarizeAssistantProcessingTrace(entries)).toBe(
      'Entendendo sua pergunta e reunindo o contexto da conversa, consultei contexto operacional relevante antes de responder e incorporei as observações encontradas antes de responder.',
    );
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
        label: 'Executando search web.',
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

  it('renders internal code tool traces with product-grade labels', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'code_outline',
      callId: 'call-code',
    });

    expect(getAssistantProcessingTrace(metadata)[0]?.label).toBe(
      'Consultei contexto operacional relevante antes de responder.',
    );
  });

  it('renders backend validation tool traces without raw tool names', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'run_backend_tests',
      callId: 'call-tests',
    });
    const label = getAssistantProcessingTrace(metadata)[0]?.label;

    expect(label).toBe('Consultei contexto operacional relevante antes de responder.');
    expect(label).not.toContain('run backend tests');
    expect(label).not.toContain('run_backend_tests');
  });

  it('renders composer capability traces with product-grade labels', () => {
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

    expect(getAssistantProcessingTrace(withImage).map((entry) => entry.label)).toEqual([
      'Consultei contexto operacional relevante antes de responder.',
      'Registrei uma limitação operacional antes de responder.',
    ]);
  });

  it('renders commerce and workspace tool traces with product-grade labels', () => {
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

    expect(getAssistantProcessingTrace(withHealth).map((entry) => entry.label)).toEqual([
      'Consultei contexto operacional relevante antes de responder.',
      'Incorporei as observações encontradas antes de responder.',
      'Consultei contexto operacional relevante antes de responder.',
    ]);
  });

  it('sanitizes persisted status trace labels from legacy internal tool wording', () => {
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

    expect(trace[0]?.label).toBe(
      'Executando checagem privada, executando checagem privada e concluiu checagem privada.',
    );
    expect(trace[0]?.label).not.toContain('code_outline');
    expect(trace[0]?.label).not.toContain('code outline');
  });

  it('sanitizes persisted status trace labels from legacy business tool wording', () => {
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

    expect(trace[0]?.label).toBe(
      'Consultei contexto operacional relevante antes de responder. Incorporei as observações encontradas antes de responder. Incorporei as observações encontradas antes de responder.',
    );
    expect(trace[0]?.label).not.toContain('list products');
    expect(trace[0]?.label).not.toContain('get settings');
    expect(trace[0]?.label).not.toContain('get billing status');
  });

  it('sanitizes persisted sales trace tool names from legacy executable traces', () => {
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
    expect(trace.map((entry) => entry.label).join(' ')).not.toContain('get order details');
    expect(trace.map((entry) => entry.label).join(' ')).not.toContain('get_order_details');
  });

  it('sanitizes persisted processing summaries from legacy internal tool wording', () => {
    const summary = summarizeAssistantProcessingTrace(
      [],
      'Executando code_outline, executando code outline e concluiu code outline.',
    );

    expect(summary).toBe(
      'Executando checagem privada, executando checagem privada e concluiu checagem privada.',
    );
    expect(summary).not.toContain('code_outline');
    expect(summary).not.toContain('code outline');
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
        label: 'Consultei contexto operacional relevante antes de responder.',
      }),
    ]);
  });

  it('labels refinement traces without exposing internal capability names', () => {
    const metadata = appendAssistantTraceFromEvent(undefined, {
      type: 'tool_call',
      tool: 'refine_response',
      callId: 'call-refine',
    });

    expect(getAssistantProcessingTrace(metadata)).toEqual([
      expect.objectContaining({
        kind: 'tool_call',
        label: 'Consultei contexto operacional relevante antes de responder.',
      }),
    ]);
  });

  it('accumulates streamed reasoning deltas into the live thinking text', () => {
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
        streamedReasoning: 'Analisando os dados da conta.',
        reasoningStartedAt: expect.any(Number),
      }),
    );
    expect(getAssistantReasoning(second).text).toBe('Analisando os dados da conta.');
  });

  it('keeps the legacy private reasoningText field out of the live thinking text', () => {
    expect(getAssistantReasoning({ reasoningText: 'legacy private reasoning' }).text).toBe('');
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

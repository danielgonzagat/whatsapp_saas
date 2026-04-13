import { describe, expect, it } from 'vitest';
import {
  appendAssistantTraceFromEvent,
  getAssistantProcessingTrace,
  getAssistantResponseVersions,
  summarizeAssistantProcessingTrace,
} from '../kloel-message-ui';

describe('kloel-message-ui', () => {
  it('normalizes persisted response versions and preserves regenerated history', () => {
    const versions = getAssistantResponseVersions(
      {
        responseVersions: [
          {
            id: 'resp-1',
            content: 'Primeira resposta',
            createdAt: '2026-04-13T10:00:00.000Z',
            source: 'initial',
          },
          {
            id: 'resp-2',
            content: 'Segunda resposta',
            createdAt: '2026-04-13T10:01:00.000Z',
            source: 'regenerated',
          },
        ],
      },
      'Resposta atual',
      'message-1',
    );

    expect(versions).toEqual([
      expect.objectContaining({
        id: 'resp-1',
        content: 'Primeira resposta',
        source: 'initial',
      }),
      expect.objectContaining({
        id: 'resp-2',
        content: 'Segunda resposta',
        source: 'regenerated',
      }),
    ]);
  });

  it('creates a fallback version when legacy messages have no stored history', () => {
    const versions = getAssistantResponseVersions(undefined, 'Resposta legada', 'message-legacy');

    expect(versions).toEqual([
      {
        id: 'message-legacy',
        content: 'Resposta legada',
        source: 'initial',
      },
    ]);
  });

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
    });
    const withToolResult = appendAssistantTraceFromEvent(withToolCall, {
      type: 'tool_result',
      tool: 'search_web',
      callId: 'call-1',
      success: true,
      result: { answer: 'ok' },
    });

    const entries = getAssistantProcessingTrace(withToolResult);

    expect(entries).toEqual([
      expect.objectContaining({
        phase: 'thinking',
        label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
      }),
      expect.objectContaining({
        phase: 'tool_calling',
        label: 'Executando search web.',
      }),
      expect.objectContaining({
        phase: 'tool_result',
        label: 'Concluiu search web.',
      }),
    ]);
    expect(summarizeAssistantProcessingTrace(entries)).toBe(
      'Entendendo sua pergunta e reunindo o contexto da conversa, executando search web e concluiu search web.',
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
});

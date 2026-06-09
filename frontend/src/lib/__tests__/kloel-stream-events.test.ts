import { describe, expect, it } from 'vitest';
import { parseKloelStreamPayload } from '../kloel-stream-events';

describe('parseKloelStreamPayload', () => {
  it('normalizes explicit typed stream payloads', () => {
    expect(
      parseKloelStreamPayload({
        type: 'status',
        phase: 'streaming_token',
        streaming: true,
        message: 'Kloel está respondendo',
        done: false,
      }),
    ).toEqual([
      {
        type: 'status',
        phase: 'streaming',
        label: 'Kloel está respondendo',
        streaming: true,
      },
    ]);

    expect(
      parseKloelStreamPayload({
        type: 'content',
        content: 'Olá, Daniel.',
        done: false,
      }),
    ).toEqual([
      {
        type: 'content',
        content: 'Olá, Daniel.',
      },
    ]);

    expect(
      parseKloelStreamPayload({
        type: 'done',
        done: true,
      }),
    ).toEqual([{ type: 'done' }]);

    expect(
      parseKloelStreamPayload({
        type: 'done',
        done: true,
        metadata: {
          capability: 'create_image',
          capabilityError: 'create_image failed internally',
          generatedImageUrl: 'https://cdn.example.test/generated.png',
        },
      }),
    ).toEqual([
      {
        type: 'done',
        metadata: {
          generatedImageUrl: 'https://cdn.example.test/generated.png',
        },
      },
    ]);
  });

  it('parses reasoning_delta text for public reasoning display', () => {
    expect(
      parseKloelStreamPayload({
        type: 'reasoning_delta',
        text: 'Analisando os dados da conta antes de responder.',
      }),
    ).toEqual([
      {
        type: 'reasoning_delta',
        text: 'Analisando os dados da conta antes de responder.',
      },
    ]);
  });

  it('ignores empty or non-string reasoning delta payloads', () => {
    expect(
      parseKloelStreamPayload({
        type: 'reasoning_delta',
        text: '',
      }),
    ).toEqual([]);

    expect(
      parseKloelStreamPayload({
        type: 'reasoning_delta',
        text: 42,
      }),
    ).toEqual([]);
  });

  it('normalizes memory-loaded stream payloads without exposing memory contents', () => {
    expect(
      parseKloelStreamPayload({
        type: 'memory_loaded',
        signalCount: 2,
        message: '2 memórias relevantes encontradas.',
        done: false,
      }),
    ).toEqual([
      {
        type: 'memory_loaded',
        signalCount: 2,
        label: '2 memórias relevantes encontradas.',
      },
    ]);

    expect(
      parseKloelStreamPayload({
        type: 'memory_loaded',
        signalCount: -3,
        message: '',
      }),
    ).toEqual([
      {
        type: 'memory_loaded',
        signalCount: 0,
        label: 'Nada relevante encontrado na memória.',
      },
    ]);
  });

  it('preserves rich public file artifact metadata from stream payloads', () => {
    expect(
      parseKloelStreamPayload({
        type: 'file',
        name: 'plano.md',
        artifactId: 'artifact-1',
        kind: 'markdown',
        content: '# Plano real',
        contentRef: 'artifact://artifact-1',
        meta: 'Documento · MD',
        url: 'https://cdn.example.test/plano.md',
        downloadUrl: 'https://cdn.example.test/plano.md?download=1',
        editable: true,
        persistent: true,
      }),
    ).toEqual([
      {
        type: 'file',
        name: 'plano.md',
        artifactId: 'artifact-1',
        kind: 'markdown',
        content: '# Plano real',
        contentRef: 'artifact://artifact-1',
        meta: 'Documento · MD',
        url: 'https://cdn.example.test/plano.md',
        downloadUrl: 'https://cdn.example.test/plano.md?download=1',
        editable: true,
        persistent: true,
      },
    ]);

    expect(
      parseKloelStreamPayload({
        type: 'file',
        name: 'unsafe.txt',
        kind: 'internal_tool_dump',
      }),
    ).toEqual([
      {
        type: 'file',
        name: 'unsafe.txt',
        artifactId: undefined,
        kind: undefined,
        content: undefined,
        contentRef: undefined,
        meta: undefined,
        url: undefined,
        downloadUrl: undefined,
        editable: undefined,
        persistent: undefined,
      },
    ]);
  });

  it('only surfaces explicitly typed public error payloads', () => {
    expect(
      parseKloelStreamPayload({
        content: 'Assistente indisponível agora.',
        error: 'ai_api_key_missing',
        done: true,
      }),
    ).toEqual([]);

    expect(
      parseKloelStreamPayload({
        type: 'error',
        content: 'Assistente indisponível agora.',
        error: 'assistente_indisponivel',
        done: true,
      }),
    ).toEqual([
      {
        type: 'error',
        error: 'assistente_indisponivel',
        content: 'Assistente indisponível agora.',
        done: true,
      },
    ]);
  });

  it('normalizes thread and tool events into a stable union', () => {
    expect(
      parseKloelStreamPayload({
        type: 'thread',
        conversationId: 'thread-1',
        title: 'Nova conversa',
        done: false,
      }),
    ).toEqual([
      {
        type: 'thread',
        conversationId: 'thread-1',
        title: 'Nova conversa',
      },
    ]);

    const parsedToolResult = parseKloelStreamPayload({
      type: 'tool_result',
      callId: 'call-1',
      spanId: 'span-1',
      tool: 'search_web',
      success: true,
      result: { answer: 'ok', rawHtml: '<secret>token</secret>' },
      error: 'provider stack trace with secret',
      artifactId: 'artifact-1',
      durationMs: 42,
      done: false,
    });

    expect(parsedToolResult).toEqual([
      {
        type: 'tool_result',
        callId: 'call-1',
        spanId: 'span-1',
        tool: 'search_web',
        success: true,
        artifactId: 'artifact-1',
        durationMs: 42,
      },
    ]);
    expect(JSON.stringify(parsedToolResult)).not.toContain('rawHtml');
    expect(JSON.stringify(parsedToolResult)).not.toContain('secret');
    expect(JSON.stringify(parsedToolResult)).toContain('search_web');
  });

  it('preserves sanitized public tool risk metadata and rejects malformed risk payloads', () => {
    const parsedToolCall = parseKloelStreamPayload({
      type: 'tool_call',
      callId: 'call-risk',
      spanId: 'call-risk',
      tool: 'send_email',
      args: { email: 'lead@example.test' },
      risk: {
        level: 'high',
        label: 'ação sensível controlada',
        score: 10,
        factors: ['pode alterar estado', 'argumentos sensíveis redigidos'],
      },
    });

    expect(parsedToolCall).toEqual([
      {
        type: 'tool_call',
        callId: 'call-risk',
        spanId: 'call-risk',
        tool: 'send_email',
        risk: {
          level: 'high',
          label: 'ação sensível controlada',
          score: 10,
          factors: ['pode alterar estado', 'argumentos sensíveis redigidos'],
        },
      },
    ]);
    expect(JSON.stringify(parsedToolCall)).not.toContain('lead@example.test');
    expect(JSON.stringify(parsedToolCall)).toContain('send_email');

    const parsedMalformedRisk = parseKloelStreamPayload({
      type: 'tool_result',
      callId: 'call-risk',
      tool: 'send_email',
      success: true,
      result: { ok: true, token: 'secret' },
      risk: { level: 'critical', label: 'send_email', score: 10 },
    });

    expect(parsedMalformedRisk).toEqual([
      {
        type: 'tool_result',
        callId: 'call-risk',
        spanId: undefined,
        tool: 'send_email',
        success: true,
        artifactId: undefined,
        durationMs: undefined,
      },
    ]);
    expect(JSON.stringify(parsedMalformedRisk)).not.toContain('token');
    expect(JSON.stringify(parsedMalformedRisk)).not.toContain('secret');
    expect(JSON.stringify(parsedMalformedRisk)).toContain('send_email');
  });

  it('ignores unknown event types instead of inventing unsupported stream events', () => {
    expect(
      parseKloelStreamPayload({
        type: 'thinking_content',
        content: 'isso não deve virar um evento aceito',
      }),
    ).toEqual([]);
  });
});

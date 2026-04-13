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
  });

  it('keeps legacy compatibility for mixed payloads with content and error', () => {
    expect(
      parseKloelStreamPayload({
        content: 'Assistente indisponível agora.',
        error: 'ai_api_key_missing',
        done: true,
      }),
    ).toEqual([
      {
        type: 'content',
        content: 'Assistente indisponível agora.',
      },
      {
        type: 'error',
        error: 'ai_api_key_missing',
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

    expect(
      parseKloelStreamPayload({
        type: 'tool_result',
        callId: 'call-1',
        tool: 'search_web',
        success: true,
        result: { answer: 'ok' },
        done: false,
      }),
    ).toEqual([
      {
        type: 'tool_result',
        callId: 'call-1',
        tool: 'search_web',
        success: true,
        result: { answer: 'ok' },
        error: undefined,
      },
    ]);
  });

  it('ignores unknown event types instead of inventing unsupported stream events', () => {
    expect(
      parseKloelStreamPayload({
        type: 'thinking_content',
        content: 'isso não deve virar um evento aceito',
      }),
    ).toEqual([
      {
        type: 'content',
        content: 'isso não deve virar um evento aceito',
      },
    ]);
  });
});

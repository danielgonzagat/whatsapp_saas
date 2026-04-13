import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateMock, tokenStorageMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  tokenStorageMock: {
    getToken: vi.fn(() => 'token-1'),
    getWorkspaceId: vi.fn(() => 'ws-1'),
  },
}));

vi.mock('swr', () => ({
  mutate: mutateMock,
}));

vi.mock('../http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../http')>();
  return {
    ...actual,
    API_BASE: 'https://api.kloel.test',
    apiUrl: (path: string) => `https://api.kloel.test${path}`,
  };
});

vi.mock('../api/core', () => ({
  tokenStorage: tokenStorageMock,
  apiFetch: vi.fn(),
}));

import { streamAuthenticatedKloelMessage } from '../kloel-conversations';

function buildSseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

describe('streamAuthenticatedKloelMessage', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    tokenStorageMock.getToken.mockReturnValue('token-1');
    tokenStorageMock.getWorkspaceId.mockReturnValue('ws-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams the typed Kloel contract end-to-end', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        buildSseResponse([
          'data: {"type":"thread","conversationId":"thread-1","title":"Nova conversa"}\n\n',
          'data: {"type":"status","phase":"thinking","message":"Kloel está pensando"}\n\n',
          'data: {"type":"status","phase":"tool_calling"}\n\n',
          'data: {"type":"tool_call","callId":"call-1","tool":"search_web","args":{"query":"pdrn"}}\n\n',
          'data: {"type":"tool_result","callId":"call-1","tool":"search_web","success":true,"result":{"answer":"ok"}}\n\n',
          'data: {"type":"status","phase":"streaming_token","message":"Kloel está respondendo"}\n\n',
          'data: {"type":"content","content":"Olá, Daniel."}\n\n',
          'data: {"type":"done","done":true}\n\n',
        ]),
      );

    vi.stubGlobal('fetch', fetchMock);

    const seenEvents: string[] = [];
    const chunks: string[] = [];
    const threads: Array<{ conversationId: string; title?: string }> = [];

    await new Promise<void>((resolve, reject) => {
      streamAuthenticatedKloelMessage(
        {
          message: 'oi',
          conversationId: null,
          mode: 'chat',
        },
        {
          onEvent: (event) => {
            if (event.type === 'status') {
              seenEvents.push(`status:${event.phase}`);
              return;
            }
            seenEvents.push(event.type);
          },
          onChunk: (chunk) => chunks.push(chunk),
          onThread: (thread) => threads.push(thread),
          onDone: resolve,
          onError: (message) => reject(new Error(message)),
        },
      );
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(threads).toEqual([{ conversationId: 'thread-1', title: 'Nova conversa' }]);
    expect(chunks.join('')).toBe('Olá, Daniel.');
    expect(seenEvents).toEqual([
      'thread',
      'status:thinking',
      'status:tool_calling',
      'tool_call',
      'tool_result',
      'status:streaming',
      'content',
      'done',
    ]);
    expect(mutateMock).toHaveBeenCalled();
  });

  it('surfaces stream errors without pretending the stream completed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        buildSseResponse([
          'data: {"type":"status","phase":"thinking","message":"Kloel está pensando"}\n\n',
          'data: {"type":"error","error":"stream_failed","content":"Falha no stream","done":true}\n\n',
        ]),
      );

    vi.stubGlobal('fetch', fetchMock);

    const errorMessage = await new Promise<string>((resolve, reject) => {
      streamAuthenticatedKloelMessage(
        {
          message: 'oi',
          conversationId: null,
          mode: 'chat',
        },
        {
          onEvent: () => undefined,
          onChunk: () => undefined,
          onDone: () => reject(new Error('stream should not finish successfully')),
          onError: resolve,
        },
      );
    });

    expect(errorMessage).toBe('Falha no stream');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('treats transport EOF without a terminal event as an error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        buildSseResponse([
          'data: {"type":"thread","conversationId":"thread-1","title":"Nova conversa"}\n\n',
          'data: {"type":"status","phase":"thinking","message":"Kloel está pensando"}\n\n',
          'data: {"type":"content","content":"Resposta parcial"}\n\n',
        ]),
      );

    vi.stubGlobal('fetch', fetchMock);

    const outcome = await new Promise<{ done: boolean; error?: string }>((resolve) => {
      streamAuthenticatedKloelMessage(
        {
          message: 'oi',
          conversationId: null,
          mode: 'chat',
        },
        {
          onEvent: () => undefined,
          onChunk: () => undefined,
          onDone: () => resolve({ done: true }),
          onError: (message) => resolve({ done: false, error: message }),
        },
      );
    });

    expect(outcome).toEqual({
      done: false,
      error:
        'A resposta foi interrompida antes da conclusão. Sua mensagem foi preservada. Tente novamente.',
    });
    expect(mutateMock).not.toHaveBeenCalled();
  });
});

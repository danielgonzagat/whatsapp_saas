import { AgentEventsService } from './agent-events.service';

function makeRedisMock() {
  const messageHandlers: Array<(channel: string, message: string) => void> = [];
  const duplicate = {
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'message') {
        messageHandlers.push(handler);
      }
    }),
    quit: jest.fn().mockResolvedValue(undefined),
  };
  const redis = {
    duplicate: jest.fn().mockReturnValue(duplicate),
    publish: jest.fn().mockImplementation((channel: string, message: string) => {
      void Promise.resolve().then(() => {
        for (const handler of messageHandlers) {
          handler(channel, message);
        }
      });
      return 1;
    }),
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  };

  return {
    redis,
    duplicate,
    messageHandlers,
    injectMessage(channel: string, message: string) {
      for (const handler of messageHandlers) {
        handler(channel, message);
      }
    },
  };
}

describe('AgentEventsService', () => {
  let service: AgentEventsService;
  let mocks: ReturnType<typeof makeRedisMock>;

  beforeEach(async () => {
    mocks = makeRedisMock();
    service = new AgentEventsService(mocks.redis as never);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('onModuleInit', () => {
    it('creates a duplicate Redis connection and subscribes to ws:agent', () => {
      expect(mocks.redis.duplicate).toHaveBeenCalled();
      expect(mocks.duplicate.subscribe).toHaveBeenCalledWith('ws:agent');
    });
  });

  describe('subscribe', () => {
    it('registers a listener for a given workspace and returns an unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe('ws-1', listener);
      expect(typeof unsubscribe).toBe('function');

      const event = {
        type: 'thought' as const,
        workspaceId: 'ws-1',
        ts: new Date().toISOString(),
        message: 'test message',
      };

      mocks.injectMessage('ws:agent', JSON.stringify(event));
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1', type: 'thought' }),
      );
    });

    it('does not deliver events from workspace B to listeners subscribed to workspace A', () => {
      const listenerA = jest.fn();
      const listenerB = jest.fn();
      service.subscribe('ws-a', listenerA);
      service.subscribe('ws-b', listenerB);

      mocks.injectMessage(
        'ws:agent',
        JSON.stringify({
          type: 'status',
          workspaceId: 'ws-a',
          ts: new Date().toISOString(),
          message: 'only for A',
        }),
      );

      expect(listenerA).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-a' }));
      expect(listenerB).not.toHaveBeenCalled();
    });

    it('unsubscribe function removes the listener and no longer dispatches', () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe('ws-x', listener);

      unsubscribe();

      mocks.injectMessage(
        'ws:agent',
        JSON.stringify({
          type: 'status',
          workspaceId: 'ws-x',
          ts: new Date().toISOString(),
          message: 'should not arrive',
        }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('returns a no-op for empty workspaceId', () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe('', listener);
      unsubscribe();
      expect(listener).not.toHaveBeenCalled();
    });

    it('removes the bucket when the last listener unsubscribes', () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe('ws-y', listener);
      unsubscribe();

      mocks.injectMessage(
        'ws:agent',
        JSON.stringify({
          type: 'status',
          workspaceId: 'ws-y',
          ts: new Date().toISOString(),
          message: 'no listeners',
        }),
      );

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('publishes a normalized event to ws:agent channel via Redis', async () => {
      await service.publish({
        type: 'thought',
        workspaceId: 'ws-pub',
        message: 'hello world',
      });

      expect(mocks.redis.publish).toHaveBeenCalledWith(
        'ws:agent',
        expect.stringContaining('"workspaceId":"ws-pub"'),
      );
    });

    it('skips publishing when workspaceId is missing', async () => {
      await service.publish({
        type: 'thought',
        workspaceId: '',
        message: 'should skip',
      });

      expect(mocks.redis.publish).not.toHaveBeenCalled();
    });

    it('skips publishing when message is empty after normalization', async () => {
      await service.publish({
        type: 'thought',
        workspaceId: 'ws-skip',
        message: '',
      });

      expect(mocks.redis.publish).not.toHaveBeenCalled();
    });

    it('strips "Prova registrada:" prefix from messages', async () => {
      await service.publish({
        type: 'proof',
        workspaceId: 'ws-pub',
        message: 'Prova registrada: contato engajou',
      });

      const callArg = mocks.redis.publish.mock.calls[0][1] as string;
      const parsed = JSON.parse(callArg);
      expect(parsed.message).toBe('contato engajou');
    });

    it('rewrites "Pensando na melhor resposta para" to "Preparando resposta para" during compose_reply phase', async () => {
      await service.publish({
        type: 'thought',
        workspaceId: 'ws-pub',
        phase: 'compose_reply',
        message: 'Pensando na melhor resposta para Joao',
      });

      const callArg = mocks.redis.publish.mock.calls[0][1] as string;
      const parsed = JSON.parse(callArg);
      expect(parsed.message).toBe('Preparando resposta para Joao');
    });

    it('falls back to local dispatch when redis.publish fails', async () => {
      mocks.redis.publish.mockRejectedValueOnce(new Error('redis down'));

      const listener = jest.fn();
      service.subscribe('ws-pub', listener);

      await service.publish({
        type: 'error',
        workspaceId: 'ws-pub',
        message: 'persistent warning',
        persistent: true,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', workspaceId: 'ws-pub' }),
      );
    });
  });

  describe('getRecent', () => {
    it('returns a copy of the history for a workspace', async () => {
      const listener = jest.fn();
      service.subscribe('ws-recent', listener);

      await service.publish({
        type: 'thought',
        workspaceId: 'ws-recent',
        message: 'msg one',
      });

      const history = service.getRecent('ws-recent');
      expect(history).toHaveLength(1);
      expect(history[0].message).toBe('msg one');
    });

    it('returns an empty array for unknown workspace', () => {
      expect(service.getRecent('ws-unknown')).toEqual([]);
    });
  });

  describe('streaming event dedup', () => {
    it('replaces the last streaming event instead of appending a duplicate', async () => {
      const listener = jest.fn();
      service.subscribe('ws-stream', listener);

      await service.publish({
        type: 'thought',
        workspaceId: 'ws-stream',
        message: 'token A',
        streaming: true,
        phase: 'streaming_token',
        runId: 'run-1',
      });

      await service.publish({
        type: 'thought',
        workspaceId: 'ws-stream',
        message: 'token B',
        streaming: true,
        phase: 'streaming_token',
        runId: 'run-1',
      });

      const history = service.getRecent('ws-stream');
      expect(history).toHaveLength(1);
      const lastMsg = history[0]!;
      expect(lastMsg.message).toBe('token B');
    });

    it('does not dedup events with different runId', async () => {
      service.subscribe('ws-stream2', jest.fn());

      await service.publish({
        type: 'thought',
        workspaceId: 'ws-stream2',
        message: 'run A',
        streaming: true,
        runId: 'run-1',
      });

      await service.publish({
        type: 'thought',
        workspaceId: 'ws-stream2',
        message: 'run B',
        streaming: true,
        runId: 'run-2',
      });

      const history = service.getRecent('ws-stream2');
      expect(history).toHaveLength(2);
    });
  });

  describe('incoming event validation', () => {
    it('drops malformed events missing workspaceId', () => {
      const listener = jest.fn();
      service.subscribe('ws-valid', listener);

      mocks.injectMessage(
        'ws:agent',
        JSON.stringify({
          type: 'thought',
          message: 'no workspace',
        }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('drops malformed events missing type', () => {
      const listener = jest.fn();
      service.subscribe('ws-valid', listener);

      mocks.injectMessage(
        'ws:agent',
        JSON.stringify({
          workspaceId: 'ws-valid',
          message: 'no type',
        }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('drops malformed events missing message', () => {
      const listener = jest.fn();
      service.subscribe('ws-valid', listener);

      mocks.injectMessage(
        'ws:agent',
        JSON.stringify({
          workspaceId: 'ws-valid',
          type: 'thought',
        }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('drops events from channels other than ws:agent', () => {
      const listener = jest.fn();
      service.subscribe('ws-valid', listener);

      mocks.injectMessage(
        'other-channel',
        JSON.stringify({
          workspaceId: 'ws-valid',
          type: 'thought',
          message: 'wrong channel',
        }),
      );

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('clears history and listeners, and quits the subscriber', async () => {
      service.subscribe('ws-destroy', jest.fn());

      await service.publish({
        type: 'thought',
        workspaceId: 'ws-destroy',
        message: 'before destroy',
      });

      expect(service.getRecent('ws-destroy')).toHaveLength(1);

      await service.onModuleDestroy();

      expect(service.getRecent('ws-destroy')).toEqual([]);
      expect(mocks.duplicate.quit).toHaveBeenCalled();
    });
  });
});

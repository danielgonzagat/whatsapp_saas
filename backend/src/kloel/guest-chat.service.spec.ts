import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GuestChatService } from './guest-chat.service';

jest.mock('openai', () => {
  const mockCompletions = { create: jest.fn() };
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: mockCompletions },
    })),
  };
});

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  chatCompletionWithRetry: jest.fn(),
}));

describe('GuestChatService', () => {
  let service: GuestChatService;
  let chatCompletionWithFallbackMock: jest.Mock;
  let chatCompletionWithRetryMock: jest.Mock;
  let mockConfigGet: jest.Mock;
  let mockRedis: { get: jest.Mock; set: jest.Mock };

  const unavailableMessage =
    'Eu continuo aqui, mas a camada de IA esta instavel agora. Tenta de novo em alguns segundos que eu retomo de onde paramos.';

  async function createService() {
    const { chatCompletionWithFallback, chatCompletionWithRetry } =
      await import('./openai-wrapper');
    chatCompletionWithFallbackMock = chatCompletionWithFallback as jest.Mock;
    chatCompletionWithRetryMock = chatCompletionWithRetry as jest.Mock;

    chatCompletionWithFallbackMock.mockResolvedValue({
      choices: [{ message: { content: 'Olá! Como posso ajudar?' } }],
      usage: { total_tokens: 80 },
    });

    const mockConfig = {
      get: mockConfigGet,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestChatService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<GuestChatService>(GuestChatService);
  }

  beforeEach(async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    mockConfigGet = jest.fn().mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return 'sk-test-key';
      }
      return undefined;
    });
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    await createService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  describe('chatSync', () => {
    it('returns assistant reply for a message', async () => {
      const reply = await service.chatSync('Olá', 'session-1');

      expect(reply).toBe('Olá! Como posso ajudar?');
      expect(chatCompletionWithFallbackMock).toHaveBeenCalled();
    });

    it('preserves conversation context across messages', async () => {
      await service.chatSync('Meu nome é João', 'session-2');

      chatCompletionWithFallbackMock.mockResolvedValueOnce({
        choices: [{ message: { content: 'Olá João! Em que posso ajudar?' } }],
        usage: { total_tokens: 90 },
      });

      const reply = await service.chatSync('O que você faz?', 'session-2');

      expect(reply).toBe('Olá João! Em que posso ajudar?');
      expect(chatCompletionWithFallbackMock).toHaveBeenCalledTimes(2);
    });

    it('persists guest conversation updates in Redis with a 24h TTL', async () => {
      await service.chatSync('Persistir conversa', 'redis-session');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'kloel:guest-chat:redis-session',
        expect.stringContaining('Persistir conversa'),
        'EX',
        86_400,
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'kloel:guest-chat:redis-session',
        expect.stringContaining('Olá! Como posso ajudar?'),
        'EX',
        86_400,
      );
    });

    it('loads existing guest conversation context from Redis', async () => {
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({
          messages: [
            { role: 'user', content: 'Mensagem antiga' },
            { role: 'assistant', content: 'Resposta antiga' },
          ],
          createdAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
        }),
      );

      await service.chatSync('Continuar', 'stored-session');

      const completionCalls = chatCompletionWithFallbackMock.mock.calls as Array<
        [unknown, { messages?: Array<{ content?: string }> }]
      >;
      const completionInput = completionCalls[0]?.[1];
      expect(
        completionInput?.messages?.some((message) => message.content === 'Mensagem antiga'),
      ).toBe(true);
    });

    it('returns unavailable message when API key is missing', async () => {
      mockConfigGet.mockReturnValue(undefined);
      delete process.env.OPENAI_API_KEY;
      await createService();

      const reply = await service.chatSync('Teste', 'session-no-key');

      expect(reply).toBe(unavailableMessage);
    });

    it('returns unavailable message when OpenAI call throws', async () => {
      chatCompletionWithFallbackMock.mockRejectedValueOnce(new Error('timeout'));

      const reply = await service.chatSync('Teste', 'session-error');

      expect(reply).toBe(unavailableMessage);
    });
  });

  describe('chat (SSE streaming)', () => {
    it('writes SSE response with assistant reply', async () => {
      const write = jest.fn();
      const end = jest.fn();
      const setHeader = jest.fn();
      const flushHeaders = jest.fn();
      const res = {
        setHeader,
        write,
        end,
        flushHeaders,
      } as import('express').Response;
      const req = {
        headers: { origin: 'https://kloel.com' },
      } as import('express').Request;

      await service.chat('Olá', 'sse-session', req, res);

      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(setHeader).toHaveBeenCalledWith('X-Session-Id', 'sse-session');
      expect(write).toHaveBeenCalled();
      expect(end).toHaveBeenCalled();
    });

    it('returns unavailable message when API key missing via SSE', async () => {
      mockConfigGet.mockReturnValue(undefined);
      delete process.env.OPENAI_API_KEY;
      await createService();

      const write = jest.fn();
      const end = jest.fn();
      const setHeader = jest.fn();
      const flushHeaders = jest.fn();
      const res = {
        setHeader,
        write,
        end,
        flushHeaders,
      } as import('express').Response;
      const req = { headers: {} } as import('express').Request;

      await service.chat('Olá', 'no-key-sse', req, res);

      const sseCalls = write.mock.calls.map((c: string[]) => c[0] as string);
      const errorChunk = sseCalls.find((s: string) => s.includes('openai_api_key_missing'));
      expect(errorChunk).toBeDefined();
      expect(end).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('returns zero stats when no conversations active', () => {
      const stats = service.getStats();

      expect(stats.activeSessions).toBe(0);
      expect(stats.totalMessages).toBe(0);
    });

    it('returns correct stats after conversations', async () => {
      await service.chatSync('Mensagem 1', 'stats-session');
      await service.chatSync('Mensagem 2', 'stats-session');

      const stats = service.getStats();

      expect(stats.activeSessions).toBeGreaterThanOrEqual(1);
      expect(stats.totalMessages).toBeGreaterThanOrEqual(4);
    });
  });

  describe('fallback chain', () => {
    it('falls back to emergency models when primary and fallback fail', async () => {
      chatCompletionWithFallbackMock.mockRejectedValueOnce(new Error('primary failed'));
      chatCompletionWithRetryMock
        .mockRejectedValueOnce(new Error('emergency 1 failed'))
        .mockRejectedValueOnce(new Error('emergency 2 failed'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Resposta do modelo de emergência!' } }],
          usage: { total_tokens: 60 },
        });

      const reply = await service.chatSync('Socorro', 'emergency-session');

      expect(reply).toBe('Resposta do modelo de emergência!');
    });

    it('returns unavailable message when all models fail', async () => {
      chatCompletionWithFallbackMock.mockRejectedValue(new Error('primary failed'));
      chatCompletionWithRetryMock.mockRejectedValue(new Error('all emergency models down'));

      const reply = await service.chatSync('Teste', 'all-down-session');

      expect(reply).toBe(unavailableMessage);
    });
  });

  describe('lifecycle', () => {
    it('cleans up interval on module destroy', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});

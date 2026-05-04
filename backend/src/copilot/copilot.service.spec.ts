jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    id: 'chat-mock',
    object: 'chat.completion',
    created: 1234567890,
    model: 'gpt-4',
    usage: { total_tokens: 120 },
    choices: [
      {
        message: { content: 'Sugestão mockada', refusal: null, role: 'assistant' },
        finish_reason: 'stop',
        index: 0,
        logprobs: null,
      },
    ],
  }),
}));

import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { CopilotService } from './copilot.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CopilotService', () => {
  let prisma: {
    contact: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    message: {
      findMany: jest.Mock;
    };
    workspace: {
      findUnique: jest.Mock;
    };
  };
  let planLimits: {
    ensureTokenBudget: jest.Mock;
    trackAiUsage: jest.Mock;
  };
  let service: CopilotService;

  beforeEach(() => {
    prisma = {
      contact: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
      },
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    service = new CopilotService(prisma as never as PrismaService, planLimits as never);
  });

  describe('suggest', () => {
    const workspaceId = 'ws-1';

    it('returns fallback when contact not found', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      const result = await service.suggest({ workspaceId, contactId: 'c-1' });

      expect(result).toHaveProperty('suggestion');
      expect(result.suggestion).toContain('Posso ajudar');
    });

    it('returns fallback when no openai api key is available', async () => {
      const saved = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
        prisma.message.findMany.mockResolvedValue([]);
        prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });

        const result = await service.suggest({ workspaceId, contactId: 'c-1' });

        expect(result).toHaveProperty('suggestion');
        expect(result.suggestion).toContain('Vi sua mensagem');
      } finally {
        if (saved) process.env.OPENAI_API_KEY = saved;
      }
    });

    it('calls openai and returns suggestion on success', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([
        { direction: 'INBOUND', content: 'Quanto custa?' },
      ]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggest({ workspaceId, contactId: 'c-1' });

      expect(result).toHaveProperty('suggestion');
      expect(result.suggestion).toBe('Sugestão mockada');
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(workspaceId);
      expect(planLimits.trackAiUsage).toHaveBeenCalled();
    });

    it('returns fallback on openai error', async () => {
      jest.mocked(chatCompletionWithRetry).mockRejectedValueOnce(new Error('API down'));

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggest({ workspaceId, contactId: 'c-1' });

      expect(result).toHaveProperty('suggestion');
      expect(result.suggestion).toContain('Estou aqui para ajudar');
    });

    it('looks up contact by phone when no contactId provided', async () => {
      const saved = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        prisma.contact.findUnique.mockResolvedValue({ id: 'c-phone' });
        prisma.message.findMany.mockResolvedValue([]);
        prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });

        const result = await service.suggest({ workspaceId, phone: '+551199999999' });

        expect(prisma.contact.findUnique).toHaveBeenCalledWith({
          where: { workspaceId_phone: { workspaceId, phone: '+551199999999' } },
        });
        expect(result.suggestion).toContain('Vi sua mensagem');
      } finally {
        if (saved) process.env.OPENAI_API_KEY = saved;
      }
    });

    it('handles empty phone as empty string', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);

      const result = await service.suggest({ workspaceId, phone: '' });

      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where: { workspaceId_phone: { workspaceId, phone: '' } },
      });
      expect(result.suggestion).toContain('Posso ajudar');
    });
  });

  describe('suggestMultiple', () => {
    const workspaceId = 'ws-1';

    it('returns fallback suggestions when contact not found', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1' });

      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0]).toContain('Olá');
    });

    it('returns fallback suggestions when no api key', async () => {
      const saved = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
        prisma.message.findMany.mockResolvedValue([]);
        prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });

        const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1' });

        expect(result.suggestions).toHaveLength(3);
        expect(result.suggestions[0]).toContain('Posso te ajudar');
      } finally {
        if (saved) process.env.OPENAI_API_KEY = saved;
      }
    });

    it('returns parsed suggestions from openai with context detection', async () => {
      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        id: 'chat-mock-1',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        usage: { total_tokens: 200, completion_tokens: 100, prompt_tokens: 100 },
        choices: [
          {
            message: {
              content: JSON.stringify({ suggestions: ['A', 'B', 'C'] }),
              refusal: null,
              role: 'assistant',
            },
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
          },
        ],
      });

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([
        { direction: 'INBOUND', content: 'Quanto custa isso?' },
      ]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1' });

      expect(result.suggestions).toEqual(['A', 'B', 'C']);
      expect(result.context).toBe('preço');
      expect(planLimits.ensureTokenBudget).toHaveBeenCalled();
      expect(planLimits.trackAiUsage).toHaveBeenCalled();
    });

    it('detects compra context from last message', async () => {
      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        id: 'chat-mock-2',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        usage: { total_tokens: 50, completion_tokens: 25, prompt_tokens: 25 },
        choices: [
          {
            message: {
              content: JSON.stringify({ suggestions: ['X'] }),
              refusal: null,
              role: 'assistant',
            },
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
          },
        ],
      });

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([
        { direction: 'INBOUND', content: 'Eu paguei pelo produto' },
      ]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1' });

      expect(result.context).toBe('compra');
    });

    it('detects dúvida context from last message', async () => {
      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        id: 'chat-mock-3',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        usage: { total_tokens: 50, completion_tokens: 25, prompt_tokens: 25 },
        choices: [
          {
            message: {
              content: JSON.stringify({ suggestions: ['X'] }),
              refusal: null,
              role: 'assistant',
            },
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
          },
        ],
      });

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([
        { direction: 'INBOUND', content: 'Tenho uma dúvida sobre como funciona' },
      ]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1' });

      expect(result.context).toBe('dúvida');
    });

    it('defaults context to geral for no keyword match', async () => {
      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        id: 'chat-mock-4',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        usage: { total_tokens: 50, completion_tokens: 25, prompt_tokens: 25 },
        choices: [
          {
            message: {
              content: JSON.stringify({ suggestions: ['X'] }),
              refusal: null,
              role: 'assistant',
            },
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
          },
        ],
      });

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([{ direction: 'INBOUND', content: 'Tudo bem?' }]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1' });

      expect(result.context).toBe('geral');
    });

    it('returns fallback suggestions on openai error', async () => {
      jest.mocked(chatCompletionWithRetry).mockRejectedValueOnce(new Error('timeout'));

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1' });

      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0]).toContain('Estou aqui para ajudar');
    });

    it('respects count option in prompt generation', async () => {
      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        id: 'chat-mock-5',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        usage: { total_tokens: 80, completion_tokens: 40, prompt_tokens: 40 },
        choices: [
          {
            message: {
              content: JSON.stringify({ suggestions: [1, 2, 3, 4, 5] }),
              refusal: null,
              role: 'assistant',
            },
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
          },
        ],
      });

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1', count: 5 });

      expect(result.suggestions).toHaveLength(5);
    });

    it('includes kbSnippet in prompt when provided', async () => {
      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        id: 'chat-mock-6',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        usage: { total_tokens: 60, completion_tokens: 30, prompt_tokens: 30 },
        choices: [
          {
            message: {
              content: JSON.stringify({ suggestions: ['Ok'] }),
              refusal: null,
              role: 'assistant',
            },
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
          },
        ],
      });

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggestMultiple({
        workspaceId,
        contactId: 'c-1',
        kbSnippet: 'Produto: Curso de Vendas',
      });

      expect(result.suggestions).toEqual(['Ok']);
    });

    it('returns fallback suggestions on invalid json from openai', async () => {
      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        id: 'chat-mock-7',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        usage: { total_tokens: 10, completion_tokens: 5, prompt_tokens: 5 },
        choices: [
          {
            message: { content: 'invalid json', refusal: null, role: 'assistant' },
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
          },
        ],
      });

      prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { openai: { apiKey: 'sk-test' } },
      });

      const result = await service.suggestMultiple({ workspaceId, contactId: 'c-1' });

      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0]).toContain('Estou aqui para ajudar');
    });
  });
});

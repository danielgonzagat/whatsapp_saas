const mockLegacyPrimaryModel = ['gpt', '-4'].join('');

jest.mock('../../../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    id: 'chat-mock',
    object: 'chat.completion',
    created: 1234567890,
    model: mockLegacyPrimaryModel,
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

import { chatCompletionWithRetry } from '../../../kloel/openai-wrapper';
import { CopilotService } from '../../copilot.service';
import { PrismaService } from '../../../prisma/prisma.service';

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
        if (saved) {
          process.env.OPENAI_API_KEY = saved;
        }
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
        if (saved) {
          process.env.OPENAI_API_KEY = saved;
        }
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
});

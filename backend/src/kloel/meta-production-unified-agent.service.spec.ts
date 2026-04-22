import { ConfigService } from '@nestjs/config';
import { MetaProductionUnifiedAgentService } from './meta-production-unified-agent.service';

type ServiceProxy = {
  buildHumanLikeLeadTacticalHint: (
    contactData: Record<string, unknown>,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => string;
  composeHumanLikeWriterReply: (
    channel: 'whatsapp' | 'instagram' | 'messenger',
    params: {
      workspaceId: string;
      customerMessage: string;
      assistantDraft?: string | null;
      actions: Array<{ tool: string; args: Record<string, unknown> }>;
      historyTurns: number;
      conversationSummary?: string;
      tacticalHint?: string;
    },
  ) => Promise<string | undefined>;
};

describe('MetaProductionUnifiedAgentService', () => {
  let service: MetaProductionUnifiedAgentService;
  let proxy: ServiceProxy;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = '';

    service = new MetaProductionUnifiedAgentService(
      {
        productAIConfig: { findMany: jest.fn().mockResolvedValue([]) },
        workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Workspace Test', providerSettings: {} }) },
        contact: { findFirst: jest.fn().mockResolvedValue(null) },
        message: { findMany: jest.fn().mockResolvedValue([]) },
        kloelMemory: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue(null) },
        product: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as ConstructorParameters<typeof MetaProductionUnifiedAgentService>[0],
      {
        get: jest.fn((key: string) => {
          if (key === 'OPENAI_API_KEY') return '';
          if (key === 'OPENAI_BRAIN_MODEL') return 'gpt-5.4-mini';
          if (key === 'OPENAI_BRAIN_FALLBACK_MODEL') return 'gpt-4.1';
          if (key === 'OPENAI_WRITER_MODEL') return 'gpt-5.4-mini';
          if (key === 'OPENAI_WRITER_FALLBACK_MODEL') return 'gpt-4.1';
          return undefined;
        }),
      } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      { sendMessage: jest.fn() } as never,
      {} as never,
      { ensureTokenBudget: jest.fn().mockResolvedValue(undefined), trackAiUsage: jest.fn().mockResolvedValue(undefined) } as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
    );

    proxy = service as unknown as ServiceProxy;
  });

  it('keeps disclosure guidance transparent and avoids lead capture pressure', () => {
    const hint = proxy.buildHumanLikeLeadTacticalHint(
      {
        name: 'Marina',
        aiSummary: 'Lead novo, veio de anúncio.',
        nextBestAction: 'responder primeiro e só depois conduzir',
      },
      'antes de continuar, voce e ia ou humano?',
      [
        { role: 'user', content: 'Oi' },
        { role: 'assistant', content: 'Oi! Me diz como posso te ajudar.' },
      ],
    );

    expect(hint).toContain('IA ou humano');
    expect(hint).toContain('Resumo comercial salvo');
    expect(hint).toContain('Próxima melhor ação recomendada');
    expect(hint).not.toContain('Posso salvar');
  });

  it('forces contextual follow-up hints to keep the active subject alive', () => {
    const hint = proxy.buildHumanLikeLeadTacticalHint(
      {
        name: 'Larissa',
        aiSummary: 'Interesse alto em harmonização full face.',
      },
      'e o prazo pra eu conseguir fazer isso?',
      [
        { role: 'user', content: 'Oi, queria saber da harmonização full face' },
        { role: 'assistant', content: 'Claro. A harmonização full face aqui está em R$ 2.400.' },
      ],
    );

    expect(hint).toContain('assunto já aberto');
    expect(hint).toContain('harmonização full face');
  });

  it('uses stricter reply budgets for Instagram than WhatsApp or Messenger', async () => {
    const draft =
      'A avaliação serve pra entender seu caso com calma, indicar o melhor caminho e te explicar valores, prazo, rotina de recuperação e próximos passos sem chute.';

    const instagram = await proxy.composeHumanLikeWriterReply('instagram', {
      workspaceId: 'ws-1',
      customerMessage: 'vi no anuncio e queria entender melhor',
      assistantDraft: draft,
      actions: [],
      historyTurns: 0,
    });
    const whatsapp = await proxy.composeHumanLikeWriterReply('whatsapp', {
      workspaceId: 'ws-1',
      customerMessage: 'vi no anuncio e queria entender melhor',
      assistantDraft: draft,
      actions: [],
      historyTurns: 0,
    });
    const messenger = await proxy.composeHumanLikeWriterReply('messenger', {
      workspaceId: 'ws-1',
      customerMessage: 'vi no anuncio e queria entender melhor',
      assistantDraft: draft,
      actions: [],
      historyTurns: 0,
    });

    expect((instagram || '').split(/\s+/).length).toBeLessThanOrEqual(
      (whatsapp || '').split(/\s+/).length,
    );
    expect((messenger || '').split(/\s+/).length).toBeGreaterThanOrEqual(
      (whatsapp || '').split(/\s+/).length,
    );
  });
});

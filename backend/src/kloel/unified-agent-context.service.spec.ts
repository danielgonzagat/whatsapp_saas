import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedAgentContextService } from './unified-agent-context.service';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';

jest.mock('./kloel.prompts', () => ({
  CANONICAL_FALLBACK_SYSTEM_PROMPT:
    'cognitive_state_boundary=distributed; verbalization_source=state_payload; fact_boundary=state_payload',
}));

const CANONICAL_FALLBACK_SYSTEM_PROMPT =
  'cognitive_state_boundary=distributed; verbalization_source=state_payload; fact_boundary=state_payload';

type ContextDataMock = {
  getWorkspaceContext: jest.Mock;
  getContactContext: jest.Mock;
  getConversationHistory: jest.Mock;
  buildAndPersistCompressedContext: jest.Mock;
  getProducts: jest.Mock;
};

describe('UnifiedAgentContextService', () => {
  let service: UnifiedAgentContextService;
  let contextData: ContextDataMock;

  const wsId = 'ws-1';
  const contactId = 'contact-1';
  const phone = '5511999999999';

  beforeEach(async () => {
    contextData = {
      getWorkspaceContext: jest.fn().mockResolvedValue({ name: 'TestCo' }),
      getContactContext: jest.fn().mockResolvedValue({ name: 'John', phone }),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      buildAndPersistCompressedContext: jest.fn().mockResolvedValue('compressed summary'),
      getProducts: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentContextService,
        { provide: UnifiedAgentContextDataService, useValue: contextData },
      ],
    }).compile();

    service = module.get<UnifiedAgentContextService>(UnifiedAgentContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('data delegation', () => {
    it('getWorkspaceContext delegates to contextData', async () => {
      await service.getWorkspaceContext(wsId);
      expect(contextData.getWorkspaceContext).toHaveBeenCalledWith(wsId);
    });

    it('getContactContext delegates to contextData', async () => {
      await service.getContactContext(wsId, contactId, phone);
      expect(contextData.getContactContext).toHaveBeenCalledWith(wsId, contactId, phone);
    });

    it('getConversationHistory delegates to contextData', async () => {
      await service.getConversationHistory(wsId, contactId, 10, phone);
      expect(contextData.getConversationHistory).toHaveBeenCalledWith(wsId, contactId, 10, phone);
    });

    it('buildAndPersistCompressedContext delegates to contextData', async () => {
      await service.buildAndPersistCompressedContext(wsId, contactId, phone, {});
      expect(contextData.buildAndPersistCompressedContext).toHaveBeenCalledWith(
        wsId,
        contactId,
        phone,
        {},
      );
    });

    it('getProducts delegates to contextData', async () => {
      await service.getProducts(wsId);
      expect(contextData.getProducts).toHaveBeenCalledWith(wsId);
    });
  });

  describe('buildSystemPrompt', () => {
    it('returns CANONICAL_FALLBACK_SYSTEM_PROMPT regardless of input (ABI-009 cutover)', () => {
      const prompt = service.buildSystemPrompt({ name: 'Empresa X' }, [
        { value: { name: 'Produto A', price: 99 } },
      ]);

      expect(prompt).toBe(CANONICAL_FALLBACK_SYSTEM_PROMPT);
    });

    it('returns CANONICAL_FALLBACK_SYSTEM_PROMPT with empty products', () => {
      const prompt = service.buildSystemPrompt({ name: 'Empresa X' }, []);

      expect(prompt).toBe(CANONICAL_FALLBACK_SYSTEM_PROMPT);
    });

    it('returns CANONICAL_FALLBACK_SYSTEM_PROMPT with sales policy present', () => {
      const prompt = service.buildSystemPrompt(
        {
          name: 'TestCo',
          salesPolicy: {
            aggressiveness: 'aggressive',
            tone: 'direto',
            instructions: 'Se o lead abandonou, avance.',
          },
        },
        [],
      );

      expect(prompt).toBe(CANONICAL_FALLBACK_SYSTEM_PROMPT);
    });

    it('returns CANONICAL_FALLBACK_SYSTEM_PROMPT with AI configs present', () => {
      const prompt = service.buildSystemPrompt(
        { name: 'TestCo' },
        [],
        [
          {
            tone: 'Consultivo',
            persistenceLevel: 4,
            customerProfile: { idealCustomer: 'Pequenas empresas' },
          },
        ],
      );

      expect(prompt).toBe(CANONICAL_FALLBACK_SYSTEM_PROMPT);
    });
  });

  describe('buildLeadTacticalHint', () => {
    it('returns hints for normal message', () => {
      const hint = service.buildLeadTacticalHint({
        currentMessage: 'Olá, quero saber mais',
        conversationHistory: [],
      });

      expect(hint).toBeDefined();
      expect(typeof hint).toBe('string');
    });

    it('includes name hint when lead has a usable name', () => {
      const hint = service.buildLeadTacticalHint({
        leadName: 'John',
        currentMessage: 'Olá',
        conversationHistory: [],
      });

      expect(hint).toContain('John');
    });

    it('includes short affirmative hint for "sim"', () => {
      const hint = service.buildLeadTacticalHint({
        currentMessage: 'sim',
        conversationHistory: [],
      });

      expect(hint).toContain('aceite curto');
    });

    it('includes emotional friction hint for problem messages', () => {
      const hint = service.buildLeadTacticalHint({
        currentMessage: 'Isso não funciona, que complicado',
        conversationHistory: [],
      });

      expect(hint).toContain('atrito emocional');
    });

    it('includes last assistant message context', () => {
      const hint = service.buildLeadTacticalHint({
        currentMessage: 'quanto custa?',
        conversationHistory: [{ role: 'assistant', content: 'Olá! Como posso ajudar?' }],
      });

      expect(hint).toContain('Como posso ajudar?');
    });

    it('does not include name hint for phone-like strings', () => {
      const hint = service.buildLeadTacticalHint({
        leadName: '+5511999999999',
        currentMessage: 'Olá',
        conversationHistory: [],
      });

      expect(hint).not.toContain('5511999999999');
    });
  });

  describe('resolveBusinessDisplayName', () => {
    it('prefers businessName from settings', () => {
      const name = service.resolveBusinessDisplayName({
        name: 'Guest Workspace',
        providerSettings: { businessName: 'My Store' },
      });

      expect(name).toBe('My Store');
    });

    it('falls back to workspace name when no settings', () => {
      const name = service.resolveBusinessDisplayName({ name: 'UniqueCo' });

      expect(name).toBe('UniqueCo');
    });

    it('skips generic labels', () => {
      const name = service.resolveBusinessDisplayName({
        name: 'guest',
        providerSettings: { businessName: 'Guest Workspace' },
      });

      expect(name).toBe('sua empresa');
    });
  });

  describe('workspace isolation', () => {
    it('getWorkspaceContext passes workspaceId to contextData', async () => {
      await service.getWorkspaceContext('ws-tenant');
      expect(contextData.getWorkspaceContext).toHaveBeenCalledWith('ws-tenant');
    });

    it('getContactContext passes workspaceId to contextData', async () => {
      await service.getContactContext('ws-tenant', contactId, phone);
      expect(contextData.getContactContext).toHaveBeenCalledWith('ws-tenant', contactId, phone);
    });

    it('getProducts passes workspaceId to contextData', async () => {
      await service.getProducts('ws-tenant');
      expect(contextData.getProducts).toHaveBeenCalledWith('ws-tenant');
    });
  });
});

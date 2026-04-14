import { AccountAgentService } from './account-agent.service';
import { ACCOUNT_CAPABILITY_REGISTRY } from './account-agent.registry';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

const { autopilotQueue } = jest.requireMock('../queue/queue');

describe('AccountAgentService', () => {
  let service: AccountAgentService;
  let prisma: any;
  let agentEvents: any;

  const memoryStore = new Map<string, any>();
  const products: any[] = [];
  const externalLinks: any[] = [];
  const approvalRequests = new Map<string, any>();
  const inputSessions = new Map<string, any>();
  const workItems = new Map<string, any>();

  const memoryKey = (workspaceId: string, key: string) => `${workspaceId}:${key}`;

  beforeEach(() => {
    jest.clearAllMocks();
    memoryStore.clear();
    products.length = 0;
    externalLinks.length = 0;
    approvalRequests.clear();
    inputSessions.clear();
    workItems.clear();

    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws-1',
          customDomain: null,
          providerSettings: {
            billingSuspended: false,
          },
        }),
      },
      agent: {
        count: jest.fn().mockResolvedValue(0),
      },
      flow: {
        count: jest.fn().mockResolvedValue(0),
      },
      campaign: {
        count: jest.fn().mockResolvedValue(0),
      },
      apiKey: {
        count: jest.fn().mockResolvedValue(0),
      },
      webhookSubscription: {
        count: jest.fn().mockResolvedValue(0),
      },
      contact: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'contact-1',
          name: 'Mayk',
          phone: '5511999999999',
        }),
      },
      product: {
        findMany: jest.fn().mockImplementation(({ where }: any = {}) => {
          return Promise.resolve(
            products.filter((product) =>
              where?.workspaceId ? product.workspaceId === where.workspaceId : true,
            ),
          );
        }),
        count: jest.fn().mockImplementation(({ where }: any = {}) => {
          return Promise.resolve(
            products.filter((product) => {
              if (where?.workspaceId && product.workspaceId !== where.workspaceId) return false;
              if (typeof where?.active === 'boolean' && product.active !== where.active)
                return false;
              return true;
            }).length,
          );
        }),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const product = {
            id: `product-${products.length + 1}`,
            ...data,
          };
          products.push(product);
          return Promise.resolve(product);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const index = products.findIndex((product) => product.id === where.id);
          products[index] = {
            ...products[index],
            ...data,
          };
          return Promise.resolve(products[index]);
        }),
      },
      kloelMemory: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(
            memoryStore.get(
              memoryKey(where.workspaceId_key.workspaceId, where.workspaceId_key.key),
            ) || null,
          );
        }),
        findMany: jest.fn().mockImplementation(({ where }: any = {}) => {
          const items = Array.from(memoryStore.values()).filter((item) => {
            if (where?.workspaceId && item.workspaceId !== where.workspaceId) return false;
            if (where?.category && item.category !== where.category) return false;
            if (where?.OR) {
              return where.OR.some((entry: any) => {
                if (entry.type) return item.type === entry.type;
                if (entry.category) return item.category === entry.category;
                return false;
              });
            }
            return true;
          });
          return Promise.resolve(items);
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
          const key = memoryKey(where.workspaceId_key.workspaceId, where.workspaceId_key.key);
          const existing = memoryStore.get(key);
          const next = existing
            ? {
                ...existing,
                ...update,
                workspaceId: existing.workspaceId,
                key: existing.key,
              }
            : { id: `memory-${memoryStore.size + 1}`, ...create };
          memoryStore.set(key, next);
          return Promise.resolve(next);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const key = memoryKey(where.workspaceId_key.workspaceId, where.workspaceId_key.key);
          const existing = memoryStore.get(key);
          const next = { ...existing, ...data };
          memoryStore.set(key, next);
          return Promise.resolve(next);
        }),
      },
      externalPaymentLink: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const link = { id: `link-${externalLinks.length + 1}`, ...data };
          externalLinks.push(link);
          return Promise.resolve(link);
        }),
      },
      approvalRequest: {
        findMany: jest.fn().mockImplementation(({ where }: any = {}) => {
          const items = Array.from(approvalRequests.values()).filter((item) => {
            if (where?.workspaceId && item.workspaceId !== where.workspaceId) return false;
            if (where?.kind && item.kind !== where.kind) return false;
            return true;
          });
          return Promise.resolve(items);
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
          const existing = approvalRequests.get(where.id);
          const next = existing ? { ...existing, ...update } : { ...create };
          approvalRequests.set(where.id, next);
          return Promise.resolve(next);
        }),
      },
      inputCollectionSession: {
        findMany: jest.fn().mockImplementation(({ where }: any = {}) => {
          const items = Array.from(inputSessions.values()).filter((item) => {
            if (where?.workspaceId && item.workspaceId !== where.workspaceId) return false;
            if (where?.kind && item.kind !== where.kind) return false;
            return true;
          });
          return Promise.resolve(items);
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
          const existing = inputSessions.get(where.id);
          const next = existing ? { ...existing, ...update } : { ...create };
          inputSessions.set(where.id, next);
          return Promise.resolve(next);
        }),
      },
      agentWorkItem: {
        findMany: jest.fn().mockImplementation(({ where }: any = {}) => {
          const items = Array.from(workItems.values()).filter((item) => {
            if (where?.workspaceId && item.workspaceId !== where.workspaceId) return false;
            return true;
          });
          return Promise.resolve(items);
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any = {}) => {
          return Promise.resolve(workItems.get(where.id) ?? null);
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
          const existing = workItems.get(where.id);
          const next = existing ? { ...existing, ...update } : { ...create };
          workItems.set(where.id, next);
          return Promise.resolve(next);
        }),
      },
    };

    agentEvents = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    service = new AccountAgentService(prisma, agentEvents);
  });

  it('creates an account approval when a customer asks for a missing product with buying intent', async () => {
    const result = await service.detectCatalogGap({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      messageContent: 'Oi, quero comprar o serum e saber o preço.',
    });

    expect(result).toEqual(
      expect.objectContaining({
        created: true,
        approval: expect.objectContaining({
          kind: 'product_creation',
          requestedProductName: 'serum',
          status: 'OPEN',
        }),
      }),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'prompt',
        phase: 'account_catalog_gap',
        workspaceId: 'ws-1',
      }),
    );
    expect(prisma.approvalRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: result.approval?.id },
      }),
    );
    expect(prisma.agentWorkItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'ws-1',
          kind: 'catalog_gap_detected',
          state: 'WAITING_APPROVAL',
        }),
      }),
    );
  });

  it('collects operator input, creates the product and resumes the contact flow', async () => {
    const detection = await service.detectCatalogGap({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      messageContent: 'Quero comprar o serum parcelado, me passa o link.',
    });

    const approvalId = detection.approval?.id;
    expect(approvalId).toBeTruthy();

    const approval = await service.approveCatalogApproval('ws-1', approvalId);
    expect(approval).toEqual(
      expect.objectContaining({
        approved: true,
        nextPrompt: expect.stringContaining('Descreva'),
      }),
    );

    const descriptionStep = await service.respondToInputSession(
      'ws-1',
      approval.inputSessionId,
      'O serum é um protocolo regenerativo premium para pele com foco em recuperação e brilho.',
    );
    expect(descriptionStep).toEqual(
      expect.objectContaining({
        completed: false,
        nextPrompt: expect.stringContaining('Descreva todos os planos'),
      }),
    );

    const offersStep = await service.respondToInputSession(
      'ws-1',
      approval.inputSessionId,
      [
        'Plano Start - 1 sessão - R$ 499,00 - desconto máximo 10% - 3x - https://pay.test/serum-start',
        'Plano Premium - 3 sessões - R$ 1299,00 - desconto máximo 12% - 6x - https://pay.test/serum-premium',
      ].join('\n'),
    );
    expect(offersStep).toEqual(
      expect.objectContaining({
        completed: false,
        nextPrompt: expect.stringContaining('informe o nome da empresa'),
      }),
    );

    const companyStep = await service.respondToInputSession(
      'ws-1',
      approval.inputSessionId,
      'Empresa: Clinica Exemplo LTDA. CNPJ 12.345.678/0001-90. Especialista em estética avançada e protocolos regenerativos.',
    );

    expect(companyStep).toEqual(
      expect.objectContaining({
        completed: true,
        productId: 'product-1',
      }),
    );
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          name: 'serum',
          paymentLink: 'https://pay.test/serum-start',
          metadata: expect.objectContaining({
            faq: expect.any(Array),
            offers: expect.any(Array),
          }),
        }),
      }),
    );
    expect(prisma.externalPaymentLink.create).toHaveBeenCalledTimes(2);
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'scan-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
      }),
      expect.any(Object),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        phase: 'account_product_materialized',
      }),
    );
    expect(prisma.inputCollectionSession.upsert).toHaveBeenCalled();
    expect(prisma.approvalRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: approvalId },
      }),
    );
    expect(prisma.agentWorkItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'conversation_reply',
          state: 'OPEN',
        }),
      }),
    );
  });

  it('materializes formal account capability gaps and exposes the registries', async () => {
    const runtime = await service.getRuntime('ws-1');
    const registry = service.getCapabilityRegistry();
    const conversationRegistry = service.getConversationActionRegistry();

    expect(registry.version).toContain('account-capability-registry');
    expect(registry.items.some((item) => item.code === 'API_KEY_CONFIGURATION')).toBe(true);
    expect(conversationRegistry.version).toContain('conversation-action-registry');
    expect(conversationRegistry.items.some((item) => item.code === 'OFFER')).toBe(true);

    expect(runtime.capabilityCount).toBe(registry.items.length);
    expect(runtime.conversationActionCount).toBe(conversationRegistry.items.length);
    expect(runtime.noLegalActions).toBe(false);
    expect(prisma.agentWorkItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'api_key_gap',
          state: 'OPEN',
        }),
      }),
    );
    expect(prisma.agentWorkItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'webhook_gap',
          state: 'OPEN',
        }),
      }),
    );
    expect(prisma.agentWorkItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'team_configuration_gap',
          state: 'OPEN',
        }),
      }),
    );
  });

  it('remains registry-consistent across 50 runtime materialization cycles for the current formal account universe', async () => {
    const capabilityKinds = new Set(
      ACCOUNT_CAPABILITY_REGISTRY.flatMap((item) => item.primaryWorkKinds),
    );
    const seenKinds = new Set<string>();

    for (let iteration = 0; iteration < 50; iteration += 1) {
      const runtime = await service.getRuntime('ws-1');

      expect(runtime.capabilityCount).toBe(ACCOUNT_CAPABILITY_REGISTRY.length);
      expect(runtime.noLegalActions).toBe(false);

      for (const workItem of runtime.workItems) {
        expect(capabilityKinds.has(workItem.kind)).toBe(true);
        seenKinds.add(workItem.kind);
      }
    }

    expect(seenKinds.has('billing_update_required')).toBe(true);
    expect(seenKinds.has('domain_gap')).toBe(true);
    expect(seenKinds.has('webhook_gap')).toBe(true);
    expect(seenKinds.has('api_key_gap')).toBe(true);
    expect(seenKinds.has('team_configuration_gap')).toBe(true);
    expect(seenKinds.has('flow_creation_candidate')).toBe(true);
    expect(seenKinds.has('campaign_launch_candidate')).toBe(true);
    expect(seenKinds.has('catalog_gap_detected')).toBe(true);
  });
});

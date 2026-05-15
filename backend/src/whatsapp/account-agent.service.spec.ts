import { AccountAgentService } from './account-agent.service';
import { ACCOUNT_CAPABILITY_REGISTRY } from './account-agent.registry';
import {
  AccountAgentMockStores,
  MockAgentEvents,
  MockPrisma,
  createMockPrisma,
  createMockStores,
} from './account-agent.service.spec.helpers';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

const { autopilotQueue } = jest.requireMock('../queue/queue');

describe('AccountAgentService', () => {
  let service: AccountAgentService;
  let prisma: MockPrisma;
  let agentEvents: MockAgentEvents;
  let stores: AccountAgentMockStores;
  let memoryStore: AccountAgentMockStores['memoryStore'];

  const memoryKey = (workspaceId: string, key: string) => `${workspaceId}:${key}`;

  beforeEach(() => {
    jest.clearAllMocks();
    stores = createMockStores();
    memoryStore = stores.memoryStore;
    prisma = createMockPrisma(stores);
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new AccountAgentService(prisma as never, agentEvents as never);
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

  it('ignores malformed persisted approval payloads when reopening a catalog gap', async () => {
    memoryStore.set(memoryKey('ws-1', 'account_approval:product_creation:serum'), {
      id: 'memory-legacy',
      workspaceId: 'ws-1',
      key: 'account_approval:product_creation:serum',
      category: 'account_approval',
      type: 'product_creation',
      value: {
        id: 'approval-legacy',
        status: 'OPEN',
        requestedProductName: { broken: true },
      },
      metadata: null,
    });

    const result = await service.detectCatalogGap({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      messageContent: 'Quero comprar o serum agora.',
    });

    expect(result.approval?.requestedProductName).toBe('serum');
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
          kind: 'catalog_gap_detected',
          state: 'WAITING_APPROVAL',
        }),
      }),
    );
  });

  it('ignores malformed memory metadata when approving a catalog gap', async () => {
    const detection = await service.detectCatalogGap({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      messageContent: 'Quero comprar o serum parcelado, me passa o link.',
    });

    const approvalId = detection.approval?.id;
    const key = memoryKey('ws-1', 'account_approval:product_creation:serum');
    memoryStore.set(key, {
      ...memoryStore.get(key),
      metadata: 'corrupted',
    });

    await service.approveCatalogApproval('ws-1', approvalId);

    const updateArgs = prisma.kloelMemory.update.mock.calls.at(-1)?.[0];
    expect(updateArgs.data.metadata).toEqual({
      status: 'APPROVED',
      inputSessionId: expect.any(String),
    });
  });

  it('ignores malformed memory metadata when completing a catalog gap from input session', async () => {
    const detection = await service.detectCatalogGap({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      messageContent: 'Quero comprar o serum parcelado, me passa o link.',
    });

    const approvalId = detection.approval?.id;
    const approval = await service.approveCatalogApproval('ws-1', approvalId);
    const key = memoryKey('ws-1', 'account_approval:product_creation:serum');
    memoryStore.set(key, {
      ...memoryStore.get(key),
      metadata: 'corrupted',
    });
    await service.respondToInputSession(
      'ws-1',
      approval.inputSessionId,
      'O serum é um protocolo regenerativo premium para pele.',
    );
    await service.respondToInputSession(
      'ws-1',
      approval.inputSessionId,
      'Plano Start - 1 sessão - R$ 499,00 - desconto máximo 10% - 3x - https://pay.test/serum-start',
    );
    await service.respondToInputSession(
      'ws-1',
      approval.inputSessionId,
      'Empresa: Clinica Exemplo LTDA. CNPJ 12.345.678/0001-90.',
    );

    const updateArgs = prisma.kloelMemory.update.mock.calls.at(-1)?.[0];
    expect(updateArgs.data.metadata).toEqual(
      expect.objectContaining({
        status: 'COMPLETED',
        productId: 'product-1',
      }),
    );
    expect(Object.keys(updateArgs.data.metadata)).toEqual(
      expect.not.arrayContaining(['0', '1', '2']),
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
    expect(prisma.agentWorkItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'api_key_gap',
          state: 'OPEN',
        }),
      }),
    );
    expect(prisma.agentWorkItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'webhook_gap',
          state: 'OPEN',
        }),
      }),
    );
    expect(prisma.agentWorkItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
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

import { Test, TestingModule } from '@nestjs/testing';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type ToolsPrismaMock = {
  kloelMemory: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
  product: {
    create: jest.Mock;
  };
  flow: {
    create: jest.Mock;
  };
  workspace: {
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('ConversationalOnboardingToolsService', () => {
  let service: ConversationalOnboardingToolsService;
  let prisma: ToolsPrismaMock;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      kloelMemory: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      product: {
        create: jest.fn().mockResolvedValue({ id: 'prod-1', name: 'Test Product' }),
      },
      flow: {
        create: jest.fn().mockResolvedValue({
          id: 'flow-1',
          name: 'Fluxo de Boas-vindas',
        }),
      },
      workspace: {
        update: jest.fn().mockResolvedValue({ id: 'ws-1', name: 'Updated' }),
      },
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          workspace: { update: prisma.workspace.update },
        }),
      ),
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationalOnboardingToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ConversationalOnboardingToolsService>(
      ConversationalOnboardingToolsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveMemory / getMemoryValue', () => {
    it('saves memory with workspaceId and key', async () => {
      await service.saveMemory('ws-1', 'businessName', 'KLOEL', 'business');

      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith({
        where: { workspaceId_key: { workspaceId: 'ws-1', key: 'businessName' } },
        create: { workspaceId: 'ws-1', key: 'businessName', value: 'KLOEL', category: 'business' },
        update: { value: 'KLOEL', category: 'business' },
      });
    });

    it('retrieves memory value by workspaceId and key', async () => {
      prisma.kloelMemory.findUnique.mockResolvedValue({
        workspaceId_key: { workspaceId: 'ws-1', key: 'theme' },
        value: 'dark',
      });

      const result = await service.getMemoryValue('ws-1', 'theme');

      expect(result).toBe('dark');
      expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith({
        where: { workspaceId_key: { workspaceId: 'ws-1', key: 'theme' } },
      });
    });

    it('returns undefined when memory not found', async () => {
      prisma.kloelMemory.findUnique.mockResolvedValue(null);

      const result = await service.getMemoryValue('ws-1', 'unknown');

      expect(result).toBeUndefined();
    });
  });

  describe('tenant isolation', () => {
    it('saveMemory scopes upsert to correct workspaceId', async () => {
      await service.saveMemory('ws-42', 'key1', 'value1', 'cat');

      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_key: { workspaceId: 'ws-42', key: 'key1' } },
        }),
      );
    });

    it('getOnboardingHistory filters by workspaceId', async () => {
      await service.getOnboardingHistory('ws-onboard');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'ws-onboard',
            key: { startsWith: 'onboarding_msg_' },
          },
        }),
      );
    });

    it('clearOnboardingHistory scopes deletion to workspaceId', async () => {
      await service.clearOnboardingHistory('ws-clear');

      expect(prisma.kloelMemory.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-clear', key: { startsWith: 'onboarding_msg_' } },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-clear',
          action: 'DELETE_ONBOARDING_HISTORY',
        }),
      );
    });
  });

  describe('executeToolCall', () => {
    it('executes save_business_info and updates workspace name', async () => {
      const result = await service.executeToolCall('ws-1', 'save_business_info', {
        businessName: 'My Store',
        ownerName: 'John',
        segment: 'ecommerce',
      });

      expect(result).toEqual({ success: true, message: 'Negócio "My Store" salvo com sucesso!' });
      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { name: 'My Store' },
      });
    });

    it('executes save_contact_info', async () => {
      const result = await service.executeToolCall('ws-1', 'save_contact_info', {
        whatsappNumber: '5511999999999',
        email: 'contact@store.com',
      });

      expect(result).toEqual({ success: true, message: 'Informações de contato salvas!' });
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledTimes(2);
    });

    it('executes add_product and persists to Product table', async () => {
      const result = await service.executeToolCall('ws-1', 'add_product', {
        name: 'Curso de Vendas',
        price: 197,
        description: 'Curso completo',
      });

      expect(result.success).toBe(true);
      expect(prisma.product.create).toHaveBeenCalled();
    });

    it('executes set_brand_voice', async () => {
      const result = await service.executeToolCall('ws-1', 'set_brand_voice', {
        tone: 'formal',
        emoji: false,
      });

      expect(result).toEqual({ success: true, message: 'Tom de voz da marca configurado!' });
    });

    it('executes set_business_hours', async () => {
      const result = await service.executeToolCall('ws-1', 'set_business_hours', {
        weekdayStart: '09:00',
        weekdayEnd: '18:00',
      });

      expect(result).toEqual({ success: true, message: 'Horário de funcionamento salvo!' });
    });

    it('executes set_main_goal', async () => {
      const result = await service.executeToolCall('ws-1', 'set_main_goal', {
        goal: 'vendas',
        targetAudience: 'Empreendedores',
      });

      expect(result.success).toBe(true);
    });

    it('returns error for unknown function', async () => {
      const result = await service.executeToolCall('ws-1', 'unknown_fn', {});

      expect(result).toEqual({ success: false, message: 'Função desconhecida: unknown_fn' });
    });
  });

  describe('type helpers', () => {
    it('readText converts numbers and booleans to string', () => {
      expect(service.readText(42)).toBe('42');
      expect(service.readText(true)).toBe('true');
      expect(service.readText(undefined)).toBe('');
      expect(service.readText('hello')).toBe('hello');
    });

  });

  describe('upstream errors', () => {
    it('handles flow creation error gracefully', async () => {
      prisma.flow.create.mockRejectedValueOnce(new Error('DB constraint violation'));

      const result = await service.executeToolCall('ws-1', 'create_initial_flow', {
        flowType: 'welcome',
      });

      expect(result.success).toBe(false);
    });
  });
});

import { BadRequestException } from '@nestjs/common';
import { ChannelSetupService } from './channel-setup.service';

describe('ChannelSetupService', () => {
  let service: ChannelSetupService;
  const workspaceFindUnique = jest.fn();
  const workspaceUpdate = jest.fn();
  const channelSetupFindUnique = jest.fn();
  const channelSetupUpsert = jest.fn();

  const prismaMock = {
    workspace: {
      findUnique: workspaceFindUnique,
      update: workspaceUpdate,
    },
    channelSetup: {
      findUnique: channelSetupFindUnique,
      upsert: channelSetupUpsert,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChannelSetupService(prismaMock as never);
  });

  describe('getSetup', () => {
    it('returns hydrated record for whatsapp channel when workspace has providerSettings', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          whatsappLifecycle: { status: 'active' },
          marketingChannelSetup: {
            whatsapp: {
              currentStep: 3,
              selectedProductIds: ['prod-1'],
              arsenal: ['msg-1'],
              config: { tone: 'professional' },
            },
          },
        },
      });
      channelSetupFindUnique.mockResolvedValue({
        currentStep: 2,
        completedAt: new Date('2026-05-01T12:00:00.000Z'),
      });

      const result = await service.getSetup('ws-1', 'whatsapp');

      expect(result.channel).toBe('whatsapp');
      expect(result.setup.currentStep).toBe(3);
      expect(result.setup.selectedProductIds).toEqual(['prod-1']);
      expect(result.setup.arsenal).toEqual(['msg-1']);
      expect(result.setup.config).toEqual({ tone: 'professional' });
      expect(result.completedAt).toBe('2026-05-01T12:00:00.000Z');
    });

    it('returns defaults when workspace is not found', async () => {
      workspaceFindUnique.mockResolvedValue(null);
      channelSetupFindUnique.mockResolvedValue(null);

      const result = await service.getSetup('ws-1', 'email');

      expect(result.channel).toBe('email');
      expect(result.setup.currentStep).toBe(0);
      expect(result.setup.selectedProductIds).toEqual([]);
      expect(result.setup.arsenal).toEqual([]);
      expect(result.setup.config).toEqual({});
      expect(result.completedAt).toBeNull();
    });

    it('throws BadRequestException for invalid channel argument', async () => {
      await expect(service.getSetup('ws-1', 'invalid')).rejects.toThrow(BadRequestException);
      await expect(service.getSetup('ws-1', 'invalid')).rejects.toThrow('invalid_marketing_channel');
    });

    it('filters prisma queries by workspaceId in getSetup', async () => {
      workspaceFindUnique.mockResolvedValue({ providerSettings: {} });
      channelSetupFindUnique.mockResolvedValue(null);

      await service.getSetup('ws-tenant-1', 'whatsapp');

      expect(workspaceFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-tenant-1' } }),
      );
      expect(channelSetupFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_channel: { workspaceId: 'ws-tenant-1', channel: 'whatsapp' } },
        }),
      );
    });
  });

  describe('saveSetup', () => {
    it('persists step, arsenal, record fields and returns updated payload', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          marketingChannelSetup: {
            whatsapp: {
              currentStep: 1,
              selectedProductIds: ['old-prod'],
              config: { tone: 'casual' },
            },
          },
        },
      });
      workspaceUpdate.mockResolvedValue({ id: 'ws-1' });
      channelSetupUpsert.mockResolvedValue({
        workspaceId: 'ws-1',
        channel: 'whatsapp',
        currentStep: 2,
      });

      const result = await service.saveSetup('ws-1', {
        channel: 'whatsapp',
        currentStep: 2,
        selectedProductIds: ['prod-1', 'prod-2'],
        arsenal: ['arsenal-1'],
        config: { tone: 'friendly', maxMessages: 10 },
      });

      expect(result.channel).toBe('whatsapp');
      expect(result.setup.currentStep).toBe(2);
      expect(result.setup.selectedProductIds).toEqual(['prod-1', 'prod-2']);
      expect(result.setup.arsenal).toEqual(['arsenal-1']);
      expect(result.setup.config).toMatchObject({ tone: 'friendly', maxMessages: 10 });
      expect(result.setup.updatedAt).toBeDefined();
      expect(typeof result.setup.updatedAt).toBe('string');

      expect(workspaceFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-1' } }),
      );
      expect(workspaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-1' } }),
      );
      expect(channelSetupUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_channel: { workspaceId: 'ws-1', channel: 'whatsapp' } },
        }),
      );
    });
  });
});

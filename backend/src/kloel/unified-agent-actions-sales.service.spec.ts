import { Test, TestingModule } from '@nestjs/testing';

jest.mock('./unified-agent-actions-sales.helpers', () => ({
  actionHandleObjection: jest.fn(),
}));

jest.mock('./unified-agent-actions-messaging.service', () => ({
  UnifiedAgentActionsMessagingService: jest.fn().mockImplementation(() => ({
    actionSendMessage: jest.fn(),
  })),
}));

import { UnifiedAgentActionsSalesService } from './unified-agent-actions-sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { OpsAlertService } from '../observability/ops-alert.service';

type SalesPrismaMock = {
  kloelMemory: { findFirst: jest.Mock; findMany: jest.Mock };
  autopilotEvent: { create: jest.Mock };
  contact: { update: jest.Mock };
};

describe('UnifiedAgentActionsSalesService', () => {
  let service: UnifiedAgentActionsSalesService;
  let prisma: SalesPrismaMock;
  let messaging: Pick<UnifiedAgentActionsMessagingService, 'actionSendMessage'>;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;

  const wsId = 'ws-1';
  const contactId = 'contact-1';
  const phone = '5511999999999';

  beforeEach(async () => {
    prisma = {
      kloelMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      autopilotEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      contact: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    messaging = {
      actionSendMessage: jest.fn().mockResolvedValue({ success: true }),
    };
    opsAlert = {
      alertOnCriticalError: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentActionsSalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: UnifiedAgentActionsMessagingService, useValue: messaging },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<UnifiedAgentActionsSalesService>(UnifiedAgentActionsSalesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('actionApplyDiscount', () => {
    it('applies discount with default values when no memory exists', async () => {
      const result = await service.actionApplyDiscount(wsId, contactId, phone, {});

      expect(result.success).toBe(true);
      expect(result.discountPercent).toBe(10);
      expect(result.originalPrice).toBe(0);
      expect(result.messageSent).toBe(true);
      expect(messaging.actionSendMessage).toHaveBeenCalled();
    });

    it('caps discountPercent at 30', async () => {
      const result = await service.actionApplyDiscount(wsId, contactId, phone, {
        discountPercent: 50,
      });

      expect(result.discountPercent).toBe(30);
    });

    it('floors discountPercent at 1', async () => {
      const result = await service.actionApplyDiscount(wsId, contactId, phone, {
        discountPercent: -5,
      });

      expect(result.discountPercent).toBe(1);
    });

    it('reads product data from kloelMemory', async () => {
      prisma.kloelMemory.findFirst.mockResolvedValue({
        value: { name: 'Plano Pro', price: 200 },
      });

      const result = await service.actionApplyDiscount(wsId, contactId, phone, {
        discountPercent: 20,
      });

      expect(result.originalPrice).toBe(200);
      expect(result.finalPrice).toBe(160);
      expect(prisma.kloelMemory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId, category: 'products' }),
        }),
      );
    });

    it('creates autopilotEvent on discount applied', async () => {
      await service.actionApplyDiscount(wsId, contactId, phone, { reason: 'Promo' });

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            contactId,
            intent: 'NEGOTIATION',
            action: 'DISCOUNT_APPLIED',
          }),
        }),
      );
    });

    it('returns error on failure', async () => {
      prisma.kloelMemory.findFirst.mockRejectedValue(new Error('DB down'));

      const result = await service.actionApplyDiscount(wsId, contactId, phone, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB down');
    });
  });

  describe('actionHandleObjection', () => {
    it('delegates to actionHandleObjection helper', async () => {
      const { actionHandleObjection } = require('./unified-agent-actions-sales.helpers');
      actionHandleObjection.mockResolvedValue({ success: true, technique: 'value_focus' });

      const result = await service.actionHandleObjection(wsId, contactId, phone, {
        objectionType: 'price',
      });

      expect(result.success).toBe(true);
      expect(actionHandleObjection).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          contactId,
          phone,
        }),
      );
    });
  });

  describe('actionQualifyLead', () => {
    it('sends qualification message and updates contact', async () => {
      const result = await service.actionQualifyLead(wsId, contactId, phone, {});

      expect(result.success).toBe(true);
      expect(result.stage).toBe('interest');
      expect(result.messageSent).toBe(true);
      expect(messaging.actionSendMessage).toHaveBeenCalled();
      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: contactId } }),
      );
    });

    it('uses custom stage', async () => {
      const result = await service.actionQualifyLead(wsId, contactId, phone, { stage: 'decision' });

      expect(result.stage).toBe('decision');
    });

    it('creates autopilotEvent for qualification', async () => {
      await service.actionQualifyLead(wsId, contactId, phone, {});

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'QUALIFICATION',
            action: 'QUALIFY_STARTED',
          }),
        }),
      );
    });

    it('handles contact update failures gracefully', async () => {
      prisma.contact.update.mockRejectedValue(new Error('update failed'));

      const result = await service.actionQualifyLead(wsId, contactId, phone, {});

      expect(result.success).toBe(true);
    });

    it('returns error on messaging failure', async () => {
      messaging.actionSendMessage = jest.fn().mockRejectedValue(new Error('send failed'));

      const result = await service.actionQualifyLead(wsId, contactId, phone, {});

      expect(result.success).toBe(false);
    });
  });

  describe('actionScheduleMeeting', () => {
    it('proposes a meeting with suggested times', async () => {
      const result = await service.actionScheduleMeeting(wsId, contactId, phone, {
        type: 'consultation',
      });

      expect(result.success).toBe(true);
      expect(result.meetingType).toBe('consultation');
      expect(result.messageSent).toBe(true);
      expect(messaging.actionSendMessage).toHaveBeenCalled();
    });

    it('uses demo type by default', async () => {
      const result = await service.actionScheduleMeeting(wsId, contactId, phone, {});

      expect(result.meetingType).toBe('demo');
    });

    it('creates autopilotEvent for scheduling', async () => {
      await service.actionScheduleMeeting(wsId, contactId, phone, {});

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'SCHEDULING',
            action: 'MEETING_PROPOSED',
          }),
        }),
      );
    });
  });

  describe('actionAntiChurn', () => {
    it('sends anti-churn message with discount strategy', async () => {
      const result = await service.actionAntiChurn(wsId, contactId, phone, {
        strategy: 'discount',
        offer: '30% off',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('discount');
      expect(result.messageSent).toBe(true);
    });

    it('uses default feedback strategy when invalid strategy given', async () => {
      const result = await service.actionAntiChurn(wsId, contactId, phone, {
        strategy: 'unknown_x',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('unknown_x');
    });

    it('creates autopilotEvent for retention', async () => {
      await service.actionAntiChurn(wsId, contactId, phone, { strategy: 'pause' });

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'RETENTION',
            action: 'ANTI_CHURN_TRIGGERED',
          }),
        }),
      );
    });

    it('sends message even when event creation fails', async () => {
      prisma.autopilotEvent.create.mockRejectedValue(new Error('event failed'));

      const result = await service.actionAntiChurn(wsId, contactId, phone, {});

      expect(result.success).toBe(true);
      expect(messaging.actionSendMessage).toHaveBeenCalled();
    });

    it('returns error on messaging failure', async () => {
      messaging.actionSendMessage = jest.fn().mockRejectedValue(new Error('send failed'));

      const result = await service.actionAntiChurn(wsId, contactId, phone, {});

      expect(result.success).toBe(false);
    });
  });

  describe('actionReactivateGhost', () => {
    it('sends reactivation message with curiosity strategy', async () => {
      const result = await service.actionReactivateGhost(wsId, contactId, phone, {
        strategy: 'curiosity',
        daysSilent: 14,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('curiosity');
      expect(result.daysSilent).toBe(14);
      expect(result.messageSent).toBe(true);
    });

    it('uses curiosity strategy by default', async () => {
      const result = await service.actionReactivateGhost(wsId, contactId, phone, {});

      expect(result.strategy).toBe('curiosity');
      expect(result.daysSilent).toBe(7);
    });

    it('creates autopilotEvent for reactivation', async () => {
      await service.actionReactivateGhost(wsId, contactId, phone, {});

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'REACTIVATION',
            action: 'GHOST_CONTACTED',
          }),
        }),
      );
    });

    it('updates contact updatedAt', async () => {
      await service.actionReactivateGhost(wsId, contactId, phone, {});

      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: contactId } }),
      );
    });

    it('handles contact update failure gracefully', async () => {
      prisma.contact.update.mockRejectedValue(new Error('update failed'));

      const result = await service.actionReactivateGhost(wsId, contactId, phone, {});

      expect(result.success).toBe(true);
    });
  });

  describe('workspace isolation', () => {
    it('actionApplyDiscount scopes kloelMemory to workspaceId', async () => {
      await service.actionApplyDiscount('ws-tenant', contactId, phone, {});
      expect(prisma.kloelMemory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
    });

    it('actionQualifyLead scopes contact update to correct contactId', async () => {
      await service.actionQualifyLead('ws-tenant', 'contact-X', phone, {});
      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'contact-X' } }),
      );
    });
  });

  describe('error handling', () => {
    it('actionApplyDiscount propagates Prisma error', async () => {
      prisma.kloelMemory.findFirst.mockRejectedValue(new Error('unique constraint'));
      const result = await service.actionApplyDiscount(wsId, contactId, phone, {});
      expect(result.success).toBe(false);
    });

    it('actionQualifyLead propagates messaging error', async () => {
      messaging.actionSendMessage = jest.fn().mockRejectedValue(new Error('send failed'));
      const result = await service.actionQualifyLead(wsId, contactId, phone, {});
      expect(result.success).toBe(false);
    });
  });
});

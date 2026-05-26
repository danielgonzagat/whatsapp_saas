import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MindGuardContextBuilderService } from './mind-guard-context-builder.service';
import type { MindActionContext } from './mind-code-native.types';
import type { ChannelSendRequest } from './channel-transport.types';

describe('MindGuardContextBuilderService', () => {
  let service: MindGuardContextBuilderService;
  let prisma: {
    contact: { findFirst: jest.Mock };
    message: { count: jest.Mock; findFirst: jest.Mock };
    conversation: { findFirst: jest.Mock };
    kloelSale: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      message: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      conversation: { findFirst: jest.fn().mockResolvedValue(null) },
      kloelSale: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindGuardContextBuilderService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MindGuardContextBuilderService);
  });

  describe('buildForSend', () => {
    it('infers withinComplianceWindow from reactive mode', async () => {
      const result = await service.buildForSend(
        'ws-1',
        { complianceMode: 'reactive' } as ChannelSendRequest,
        {},
      );
      expect(result.withinComplianceWindow).toBe(true);
      expect(result.templateApproved).toBe(true);
    });

    it('uses contact lastInbound to flip compliance window', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-1' });
      const result = await service.buildForSend(
        'ws-1',
        { complianceMode: 'proactive' } as ChannelSendRequest,
        { contactId: 'c1' },
      );
      expect(result.withinComplianceWindow).toBe(true);
    });

    it('respects explicit baseContext.withinComplianceWindow override', async () => {
      const result = await service.buildForSend(
        'ws-1',
        { complianceMode: 'proactive' } as ChannelSendRequest,
        { withinComplianceWindow: false },
      );
      expect(result.withinComplianceWindow).toBe(false);
    });
  });

  describe('buildForDiscount', () => {
    it('defaults maxDiscountPercent=30 and minMarginPercent=0', async () => {
      const result = await service.buildForDiscount('ws-1', {});
      expect(result.maxDiscountPercent).toBe(30);
      expect(result.minMarginPercent).toBe(0);
    });

    it('preserves explicit overrides', async () => {
      const result = await service.buildForDiscount('ws-1', {
        maxDiscountPercent: 50,
        minMarginPercent: 5,
      });
      expect(result.maxDiscountPercent).toBe(50);
      expect(result.minMarginPercent).toBe(5);
    });
  });

  describe('buildForPayment', () => {
    it('defaults maxPaymentAmount=5000 and paymentProcessed=false (no external id)', async () => {
      const result = await service.buildForPayment('ws-1', {});
      expect(result.maxPaymentAmount).toBe(5000);
      expect(result.paymentProcessed).toBe(false);
    });

    it('queries sales when paymentExternalId is set', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({ id: 'sale-1' });
      const result = await service.buildForPayment('ws-1', {
        paymentExternalId: 'pay_123',
      });
      expect(result.paymentProcessed).toBe(true);
    });
  });

  describe('buildForTransfer', () => {
    it('escalationInProgress=true when contact has HUMAN conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'c1' });
      const result = await service.buildForTransfer('ws-1', {
        contactId: 'contact-1',
      });
      expect(result.escalationInProgress).toBe(true);
      expect(result.humanAvailable).toBe(true);
    });

    it('escalationInProgress=false when no HUMAN conversation', async () => {
      const result = await service.buildForTransfer('ws-1', {
        contactId: 'contact-1',
      });
      expect(result.escalationInProgress).toBe(false);
    });
  });

  describe('buildForBroadcast', () => {
    it('defaults: campaignActive=true, campaignBudgetExhausted=false, withinComplianceWindow=false', async () => {
      const result = await service.buildForBroadcast('ws-1', {});
      expect(result.campaignActive).toBe(true);
      expect(result.campaignBudgetExhausted).toBe(false);
      expect(result.withinComplianceWindow).toBe(false);
    });
  });

  describe('buildContactContext (via buildForSend)', () => {
    it('derives contactOptOut=true when contact.optIn is false', async () => {
      prisma.contact.findFirst.mockResolvedValue({ optIn: false, optedOutAt: null });
      const result = await service.buildForSend(
        'ws-1',
        { complianceMode: 'reactive' } as ChannelSendRequest,
        { contactId: 'c1' },
      );
      expect(result.contactOptOut).toBe(true);
    });

    it('derives contactOptOut=true when optedOutAt is set', async () => {
      prisma.contact.findFirst.mockResolvedValue({ optIn: true, optedOutAt: new Date() });
      const result = await service.buildForSend(
        'ws-1',
        { complianceMode: 'reactive' } as ChannelSendRequest,
        { contactId: 'c1' },
      );
      expect(result.contactOptOut).toBe(true);
    });
  });
});

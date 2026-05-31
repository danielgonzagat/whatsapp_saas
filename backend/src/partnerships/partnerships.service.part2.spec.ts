import { expectValueOf } from '../../test/expect-value-of';
import { Test, TestingModule } from '@nestjs/testing';
import { PartnershipsService } from './partnerships.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
import type { PartnershipsPrismaMock } from './partnerships.service.spec.fixtures';
import { createPartnershipsPrismaMock } from './partnerships.service.spec.fixtures';

describe('PartnershipsService', () => {
  let service: PartnershipsService;
  let prisma: PartnershipsPrismaMock;

  beforeEach(async () => {
    prisma = createPartnershipsPrismaMock();

    const emailService = {
      sendPartnerInviteEmail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnershipsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') },
        },
        {
          provide: EmailService,
          useValue: emailService,
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(PartnershipsService);
  });

  // ═══ CHAT ═══

  describe('getChatContacts', () => {
    it('sorts contacts by most recent message first', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'p1',
          partnerName: 'Older Message',
          partnerEmail: 'old@test.com',
          type: 'AFFILIATE',
        },
        {
          id: 'p2',
          partnerName: 'Newer Message',
          partnerEmail: 'new@test.com',
          type: 'PRODUCER',
        },
      ]);
      prisma.partnerMessage.groupBy.mockResolvedValue([]);
      prisma.partnerMessage.findMany.mockResolvedValue([
        { partnerId: 'p2', content: 'new', createdAt: new Date('2026-03-27') },
        { partnerId: 'p1', content: 'old', createdAt: new Date('2026-03-20') },
      ]);

      const result = await service.getChatContacts('ws-1');

      expect(result.contacts[0].name).toBe('Newer Message');
      expect(result.contacts[1].name).toBe('Older Message');
    });

    it('generates avatar initials from partner name', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'p1',
          partnerName: 'Ana Beatriz Costa',
          partnerEmail: 'abc@test.com',
          type: 'AFFILIATE',
        },
      ]);
      prisma.partnerMessage.groupBy.mockResolvedValue([]);
      prisma.partnerMessage.findMany.mockResolvedValue([]);

      const result = await service.getChatContacts('ws-1');

      expect(result.contacts[0].avatar).toBe('AB'); // first 2 initials
    });

    it('contacts with no messages sort to the end', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'p1',
          partnerName: 'No Messages',
          partnerEmail: 'no@test.com',
          type: 'AFFILIATE',
        },
        {
          id: 'p2',
          partnerName: 'Has Message',
          partnerEmail: 'has@test.com',
          type: 'AFFILIATE',
        },
      ]);
      prisma.partnerMessage.groupBy.mockResolvedValue([]);
      prisma.partnerMessage.findMany.mockResolvedValue([
        { partnerId: 'p2', content: 'hi', createdAt: new Date() },
      ]);

      const result = await service.getChatContacts('ws-1');

      expect(result.contacts[0].name).toBe('Has Message');
      expect(result.contacts[1].name).toBe('No Messages');
    });
  });

  // messageLimit: partner chat is internal DB-only, not WhatsApp; no rate limit applies
  describe('sendMessage', () => {
    it('creates message with OWNER senderType', async () => {
      prisma.partnerMessage.create.mockResolvedValue({
        id: 'm1',
        content: 'Hello',
        senderType: 'OWNER',
      });

      const result = await service.sendMessage('p1', 'Hello', 'agent-1', 'Admin');

      expect(prisma.partnerMessage.create).toHaveBeenCalledWith({
        data: {
          partnerId: 'p1',
          senderId: 'agent-1',
          senderType: 'OWNER',
          senderName: 'Admin',
          content: 'Hello',
        },
      });
      expect(result.content).toBe('Hello');
    });
  });

  describe('markAsRead', () => {
    it('marks only PARTNER messages as read', async () => {
      prisma.partnerMessage.updateMany.mockResolvedValue({ count: 3 });

      await service.markAsRead('p1');

      expect(prisma.partnerMessage.updateMany).toHaveBeenCalledWith({
        where: { partnerId: 'p1', senderType: 'PARTNER', readAt: null },
        data: { readAt: expectValueOf(Date) },
      });
    });
  });
});

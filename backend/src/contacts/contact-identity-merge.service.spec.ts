import { Test, TestingModule } from '@nestjs/testing';
import { ContactIdentityMergeService } from './contact-identity-merge.service';
import { PrismaService } from '../prisma/prisma.service';
import { type FlexMock } from '../../test/helpers/prisma.mock';
interface MockPrisma {
  contactIdentityLink: {
    findUnique: FlexMock<(args: unknown) => unknown>;
    create: FlexMock<(args: unknown) => unknown>;
  };
  channelIdentifier: {
    updateMany: FlexMock<(args: unknown) => unknown>;
  };
  message: {
    updateMany: FlexMock<(args: unknown) => unknown>;
  };
  conversation: {
    updateMany: FlexMock<(args: unknown) => unknown>;
  };
  followUp: {
    updateMany: FlexMock<(args: unknown) => unknown>;
  };
  deal: {
    updateMany: FlexMock<(args: unknown) => unknown>;
  };
  flowExecution: {
    updateMany: FlexMock<(args: unknown) => unknown>;
  };
  autopilotEvent: {
    updateMany: FlexMock<(args: unknown) => unknown>;
  };
  checkoutSocialLead: {
    updateMany: FlexMock<(args: unknown) => unknown>;
  };
  $transaction: FlexMock<(fn: (tx: unknown) => unknown) => unknown>;
}

describe('ContactIdentityMergeService', () => {
  let service: ContactIdentityMergeService;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = {
      contactIdentityLink: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      channelIdentifier: {
        updateMany: jest.fn(),
      },
      message: {
        updateMany: jest.fn(),
      },
      conversation: {
        updateMany: jest.fn(),
      },
      followUp: {
        updateMany: jest.fn(),
      },
      deal: {
        updateMany: jest.fn(),
      },
      flowExecution: {
        updateMany: jest.fn(),
      },
      autopilotEvent: {
        updateMany: jest.fn(),
      },
      checkoutSocialLead: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactIdentityMergeService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ContactIdentityMergeService>(ContactIdentityMergeService);
  });

  describe('mergeContacts', () => {
    it('throws when trying to merge a contact with itself', async () => {
      await expect(
        service.mergeContacts({
          workspaceId: 'ws-1',
          sourceContactId: 'contact-a',
          targetContactId: 'contact-a',
          matchReason: 'phone_match',
        }),
      ).rejects.toThrow('Cannot merge a contact with itself');
    });

    it('returns existing link if sourceContactId is already linked to targetContactId', async () => {
      mockPrisma.contactIdentityLink.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        contactId: 'contact-b',
        linkedContactId: 'contact-a',
      });

      const result = await service.mergeContacts({
        workspaceId: 'ws-1',
        sourceContactId: 'contact-a',
        targetContactId: 'contact-b',
        matchReason: 'phone_match',
      });

      expect(result.linkId).toBe('link-1');
      expect(result.wasLinked).toBe(false);
    });

    it('returns existing link if reverse direction exists', async () => {
      mockPrisma.contactIdentityLink.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'link-2',
        contactId: 'contact-a',
        linkedContactId: 'contact-b',
      });

      const result = await service.mergeContacts({
        workspaceId: 'ws-1',
        sourceContactId: 'contact-a',
        targetContactId: 'contact-b',
        matchReason: 'email_match',
      });

      expect(result.linkId).toBe('link-2');
      expect(result.wasLinked).toBe(false);
    });

    it('creates identity link and reassigns all related records from source to target', async () => {
      mockPrisma.contactIdentityLink.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.contactIdentityLink.create.mockResolvedValue({
        id: 'link-new',
        contactId: 'contact-target',
        linkedContactId: 'contact-source',
      });

      const result = await service.mergeContacts({
        workspaceId: 'ws-1',
        sourceContactId: 'contact-source',
        targetContactId: 'contact-target',
        matchReason: 'operator_merge',
        confidence: 0.95,
        mergedBy: 'agent-1',
      });

      expect(result.wasLinked).toBe(true);
      expect(mockPrisma.channelIdentifier.updateMany).toHaveBeenCalled();
      expect(mockPrisma.message.updateMany).toHaveBeenCalled();
      expect(mockPrisma.conversation.updateMany).toHaveBeenCalled();
      expect(mockPrisma.followUp.updateMany).toHaveBeenCalled();
      expect(mockPrisma.deal.updateMany).toHaveBeenCalled();
      expect(mockPrisma.flowExecution.updateMany).toHaveBeenCalled();
      expect(mockPrisma.autopilotEvent.updateMany).toHaveBeenCalled();
      expect(mockPrisma.checkoutSocialLead.updateMany).toHaveBeenCalled();
    });
  });
});

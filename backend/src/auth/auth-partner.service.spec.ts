import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectService } from '../payments/connect/connect.service';
import { AuditService } from '../audit/audit.service';
import { AuthPartnerService } from './auth-partner.service';

const mockPrismaService = {
  affiliatePartner: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  agent: {
    delete: jest.fn(),
  },
  workspace: {
    delete: jest.fn(),
  },
  connectAccountBalance: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return arg({
        agent: mockPrismaService.agent,
        workspace: mockPrismaService.workspace,
        connectAccountBalance: mockPrismaService.connectAccountBalance,
        auditService: mockAuditService,
      });
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  }),
};

const mockConnectService = {
  createCustomAccount: jest.fn(),
};

const mockAuditService = {
  logWithTx: jest.fn(),
};

describe('AuthPartnerService', () => {
  let service: AuthPartnerService;
  let prisma: typeof mockPrismaService;
  let connectService: typeof mockConnectService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthPartnerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConnectService, useValue: mockConnectService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AuthPartnerService>(AuthPartnerService);
    prisma = mockPrismaService;
    connectService = module.get(ConnectService);
  });

  describe('resolvePartnerInviteAccountType', () => {
    it('resolves AFFILIATE type', () => {
      const result = service.resolvePartnerInviteAccountType('AFFILIATE');
      expect(result).toBe('AFFILIATE');
    });

    it('resolves COPRODUCER type', () => {
      const result = service.resolvePartnerInviteAccountType('COPRODUCER');
      expect(result).toBe('COPRODUCER');
    });

    it('resolves SUPPLIER type', () => {
      const result = service.resolvePartnerInviteAccountType('SUPPLIER');
      expect(result).toBe('SUPPLIER');
    });

    it('resolves MANAGER type', () => {
      const result = service.resolvePartnerInviteAccountType('MANAGER');
      expect(result).toBe('MANAGER');
    });

    it('throws BadRequestException for invalid type', () => {
      expect(() => service.resolvePartnerInviteAccountType('INVALID_TYPE')).toThrow(
        BadRequestException,
      );
    });

    it('normalizes case-insensitive input', () => {
      const result = service.resolvePartnerInviteAccountType('affiliate');
      expect(result).toBe('AFFILIATE');
    });
  });

  describe('resolvePartnerInvite', () => {
    it('returns null when token is empty', async () => {
      const result = await service.resolvePartnerInvite('', 'partner@example.com');
      expect(result).toBeNull();
    });

    it('returns null when token is undefined', async () => {
      const result = await service.resolvePartnerInvite(undefined, 'partner@example.com');
      expect(result).toBeNull();
    });

    it('returns partner invite when valid token and email match', async () => {
      prisma.affiliatePartner.findFirst.mockResolvedValue({
        id: 'partner-1',
        workspaceId: 'seller-ws',
        partnerName: 'Partner A',
        partnerEmail: 'partner@example.com',
        type: 'AFFILIATE',
        partnerWorkspaceId: null,
        metadata: { inviteTokenHash: 'placeholder' },
      });

      const result = await service.resolvePartnerInvite('valid-token', 'partner@example.com');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'partner-1',
          partnerEmail: 'partner@example.com',
          type: 'AFFILIATE',
        }),
      );
      expect(prisma.affiliatePartner.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            partnerEmail: 'partner@example.com',
          }),
        }),
      );
    });

    it('throws BadRequestException when partner invite not found', async () => {
      prisma.affiliatePartner.findFirst.mockResolvedValue(null);

      await expect(
        service.resolvePartnerInvite('bad-token', 'partner@example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when partnerWorkspaceId already set', async () => {
      prisma.affiliatePartner.findFirst.mockResolvedValue({
        id: 'partner-1',
        workspaceId: 'seller-ws',
        partnerName: 'Partner A',
        partnerEmail: 'partner@example.com',
        type: 'AFFILIATE',
        partnerWorkspaceId: 'existing-ws',
        metadata: { inviteTokenHash: 'placeholder' },
      });

      await expect(
        service.resolvePartnerInvite('valid-token', 'partner@example.com'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('finalizePartnerInviteRegistration', () => {
    const agentStub = {
      id: 'agent-1',
      email: 'partner@example.com',
      password: '',
      name: 'Partner A',
      role: 'ADMIN' as const,
      workspaceId: 'ws-1',
      provider: null,
      providerId: null,
      avatarUrl: null,
      partnerId: null,
      emailVerified: false,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      disabledAt: null,
      deletedAt: null,
    };

    const workspaceStub = {
      id: 'ws-1',
      name: 'Partner Workspace',
      cnpj: null,
      phone: null,
      address: null,
      logo: null,
      settings: {},
      plan: 'FREE',
      subscriptionId: null,
      subscriptionStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('updates partner and creates connect account on success', async () => {
      connectService.createCustomAccount.mockResolvedValue({
        accountBalanceId: 'cab-123',
        stripeAccountId: 'acct_123',
        requestedCapabilities: ['card_payments', 'transfers'],
      });
      prisma.affiliatePartner.update.mockResolvedValue({
        id: 'partner-1',
        workspaceId: 'seller-ws',
      });

      await service.finalizePartnerInviteRegistration({
        invite: { id: 'partner-1', metadata: { inviteTokenHash: 'hash' }, type: 'AFFILIATE' },
        workspace: workspaceStub as import('@prisma/client').Workspace,
        agent: agentStub as import('@prisma/client').Agent,
        email: 'partner@example.com',
      });

      expect(connectService.createCustomAccount).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        accountType: 'AFFILIATE',
        email: 'partner@example.com',
        displayName: 'Partner Workspace',
      });
      expect(prisma.affiliatePartner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'partner-1' },
          data: expect.objectContaining({
            partnerWorkspaceId: 'ws-1',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('rolls back workspace and agent on connect creation failure', async () => {
      connectService.createCustomAccount.mockRejectedValue(new Error('Stripe API down'));
      mockAuditService.logWithTx.mockResolvedValue(undefined);

      await expect(
        service.finalizePartnerInviteRegistration({
          invite: { id: 'partner-1', metadata: null, type: 'AFFILIATE' },
          workspace: workspaceStub as import('@prisma/client').Workspace,
          agent: agentStub as import('@prisma/client').Agent,
          email: 'partner@example.com',
        }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});

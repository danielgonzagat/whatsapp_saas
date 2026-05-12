import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { JwtSetValidator } from './utils/jwt-set.validator';
import { ComplianceService } from './compliance.service';

jest.mock('../common/utils/unsubscribe-token.util', () => ({
  verifyUnsubscribeToken: jest.fn(),
}));
jest.mock('./utils/signed-request.validator', () => ({
  validateSignedRequest: jest.fn(),
}));

import { verifyUnsubscribeToken } from '../common/utils/unsubscribe-token.util';
import { validateSignedRequest } from './utils/signed-request.validator';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let prisma: {
    dataDeletionRequest: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    socialAccount: { updateMany: jest.Mock; findFirst: jest.Mock };
    agent: { findFirst: jest.Mock };
    contact: { updateMany: jest.Mock };
    riscEvent: { create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      dataDeletionRequest: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'req-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      socialAccount: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      agent: { findFirst: jest.fn().mockResolvedValue(null) },
      contact: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      riscEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtSetValidator, useValue: { validate: jest.fn() } },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(ComplianceService);
    (verifyUnsubscribeToken as jest.Mock).mockReset();
    (validateSignedRequest as jest.Mock).mockReset();
  });

  describe('getDeletionStatus', () => {
    it('returns request when found', async () => {
      prisma.dataDeletionRequest.findUnique.mockResolvedValue({
        provider: 'facebook',
        status: 'completed',
        requestedAt: new Date(),
        completedAt: new Date(),
      });
      const result = await service.getDeletionStatus('CODE-1');
      expect(result.provider).toBe('facebook');
    });

    it('throws NotFoundException when no request exists for the code', async () => {
      prisma.dataDeletionRequest.findUnique.mockResolvedValue(null);
      await expect(service.getDeletionStatus('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleFacebookDataDeletion', () => {
    it('throws BadRequestException when signed_request has no user_id', async () => {
      (validateSignedRequest as jest.Mock).mockReturnValue({ user_id: '' });
      await expect(service.handleFacebookDataDeletion('sig')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates DataDeletionRequest with status=processing and returns url + code', async () => {
      (validateSignedRequest as jest.Mock).mockReturnValue({ user_id: 'fb-1' });
      prisma.dataDeletionRequest.create.mockResolvedValue({ id: 'req-1' });
      const result = await service.handleFacebookDataDeletion('sig');
      expect(prisma.dataDeletionRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'facebook',
          providerUserId: 'fb-1',
          status: 'processing',
        }),
      });
      expect(result.confirmation_code).toBeTruthy();
      expect(result.url).toMatch(/data-deletion\/status\//);
    });

    it('translates validator exceptions into BadRequestException via opsAlert path', async () => {
      (validateSignedRequest as jest.Mock).mockImplementation(() => {
        throw new Error('bad signature');
      });
      await expect(service.handleFacebookDataDeletion('sig')).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleFacebookDeauthorize', () => {
    it('revokes all socialAccount rows for the provider user', async () => {
      (validateSignedRequest as jest.Mock).mockReturnValue({ user_id: 'fb-1' });
      await service.handleFacebookDeauthorize('sig');
      expect(prisma.socialAccount.updateMany).toHaveBeenCalledWith({
        where: { provider: 'facebook', providerUserId: 'fb-1' },
        data: expect.objectContaining({
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
        }),
      });
    });
  });

  describe('unsubscribeMarketingEmail', () => {
    it('rejects when token is invalid', async () => {
      (verifyUnsubscribeToken as jest.Mock).mockReturnValue(null);
      await expect(service.unsubscribeMarketingEmail('bad-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when workspaceId missing from token', async () => {
      (verifyUnsubscribeToken as jest.Mock).mockReturnValue({ email: 'a@a.com' });
      await expect(service.unsubscribeMarketingEmail('tok')).rejects.toThrow(BadRequestException);
    });

    it('flips opt-in to false for matching contacts, returns count', async () => {
      (verifyUnsubscribeToken as jest.Mock).mockReturnValue({
        workspaceId: 'ws-1',
        email: 'Test@Example.com',
      });
      const result = await service.unsubscribeMarketingEmail('tok');
      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: {
          workspaceId: 'ws-1',
          email: { equals: 'test@example.com', mode: 'insensitive' },
          optIn: true,
        },
        data: expect.objectContaining({ optIn: false }),
      });
      expect(result).toEqual({ unsubscribed: true, email: 'test@example.com', contactCount: 3 });
    });
  });
});

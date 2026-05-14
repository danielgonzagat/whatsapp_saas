import {
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CheckoutSocialProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAuthService } from '../auth/google-auth.service';
import { FacebookAuthService } from '../auth/facebook-auth.service';
import { AppleAuthService } from '../auth/apple-auth.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';

jest.mock('../queue/queue', () => ({
  crmQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('./checkout-social-lead.candidate', () => ({
  findLatestCandidate: jest.fn().mockResolvedValue(null),
}));

type PrismaMock = {
  checkoutSocialLead: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  checkoutProductPlan: {
    findUnique: jest.Mock;
  };
  contact: {
    upsert: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('CheckoutSocialLeadService', () => {
  let service: CheckoutSocialLeadService;
  let prisma: PrismaMock;
  let googleAuth: { verifyCredential: jest.Mock; fetchPeopleProfile: jest.Mock };
  let facebookAuth: { verifyAccessToken: jest.Mock };
  let appleAuth: { verifyCredential: jest.Mock };

  beforeEach(() => {
    googleAuth = {
      verifyCredential: jest.fn().mockResolvedValue({
        providerId: 'g-123',
        email: 'user@gmail.com',
        emailVerified: true,
        name: 'Google User',
        image: 'https://img.url',
      }),
      fetchPeopleProfile: jest.fn().mockResolvedValue({}),
    };
    facebookAuth = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        providerId: 'fb-123',
        email: 'fb@test.com',
        emailVerified: true,
        name: 'FB User',
        image: 'https://fb.img',
      }),
    };
    appleAuth = {
      verifyCredential: jest.fn().mockResolvedValue({
        providerId: 'apple-123',
        email: 'apple@test.com',
        emailVerified: true,
        name: 'Apple User',
        image: null,
      }),
    };

    prisma = {
      checkoutSocialLead: {
        create: jest.fn().mockResolvedValue({
          id: 'lead-1',
          provider: CheckoutSocialProvider.GOOGLE,
          name: 'Test',
          email: 'test@test.com',
          avatarUrl: null,
          deviceFingerprint: 'fp-1',
          workspaceId: 'ws-1',
          checkoutSlug: 'test-plan',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          id: 'lead-1',
          workspaceId: 'ws-1',
          provider: CheckoutSocialProvider.GOOGLE,
          name: 'Test',
          email: 'test@test.com',
          avatarUrl: null,
          deviceFingerprint: 'fp-1',
          phone: null,
          cpf: null,
          enrichmentData: null,
          stepReached: 0,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      checkoutProductPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'plan-1',
          slug: 'test-plan',
          productId: 'prod-1',
          product: { workspaceId: 'ws-1' },
        }),
      },
      contact: {
        upsert: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          checkoutSocialLead: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'lead-1',
              workspaceId: 'ws-1',
              provider: CheckoutSocialProvider.GOOGLE,
              name: 'Test',
              email: 'test@test.com',
              phone: null,
              cpf: null,
              enrichmentData: null,
              stepReached: 0,
            }),
            update: jest.fn().mockResolvedValue({ id: 'lead-1', contactId: null }),
          },
        }),
      ),
    };

    service = new CheckoutSocialLeadService(
      prisma as PrismaService,
      googleAuth as GoogleAuthService,
      facebookAuth as FacebookAuthService,
      appleAuth as AppleAuthService,
    );
  });

  describe('captureLead', () => {
    it('throws NotFoundException when plan slug is not found', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.captureLead({ slug: 'nonexistent', provider: 'google' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when Google verification fails', async () => {
      googleAuth.verifyCredential.mockRejectedValueOnce(
        new UnauthorizedException('Invalid token'),
      );
      await expect(
        service.captureLead({ slug: 'test-plan', provider: 'google', credential: 'bad' } as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('captures a Google lead successfully', async () => {
      const result = await service.captureLead({
        slug: 'test-plan',
        provider: 'google',
        credential: 'valid-cred',
      } as never);

      expect(result).toMatchObject({
        leadId: 'lead-1',
        provider: 'google',
        name: 'Test',
        email: 'test@test.com',
        workspaceId: 'ws-1',
      });
      expect(googleAuth.verifyCredential).toHaveBeenCalledWith('valid-cred');
    });

    it('captures a Facebook lead successfully', async () => {
      const result = await service.captureLead({
        slug: 'test-plan',
        provider: 'facebook',
        accessToken: 'fb-token',
        userId: 'fb-user',
      } as never);

      expect(result).toMatchObject({ leadId: 'lead-1', provider: 'facebook' });
      expect(facebookAuth.verifyAccessToken).toHaveBeenCalledWith('fb-token', 'fb-user');
    });

    it('captures an Apple lead successfully', async () => {
      const result = await service.captureLead({
        slug: 'test-plan',
        provider: 'apple',
        identityToken: 'apple-id-token',
      } as never);

      expect(result).toMatchObject({ leadId: 'lead-1', provider: 'apple' });
      expect(appleAuth.verifyCredential).toHaveBeenCalled();
    });
  });

  describe('markConvertedFromOrder', () => {
    it('marks a lead as CONVERTED by capturedLeadId', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({
        id: 'lead-1',
        workspaceId: 'ws-1',
        status: 'CONVERTED',
        convertedAt: new Date(),
        convertedOrderId: 'order-1',
      });
      prisma.checkoutSocialLead.findFirst = jest.fn().mockResolvedValue({ id: 'lead-1' });
      prisma.checkoutSocialLead.update = mockUpdate;

      const result = await service.markConvertedFromOrder({
        workspaceId: 'ws-1',
        orderId: 'order-1',
        capturedLeadId: 'lead-1',
      });

      expect(result).toMatchObject({
        id: 'lead-1',
        workspaceId: 'ws-1',
        status: 'CONVERTED',
        convertedOrderId: 'order-1',
      });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CONVERTED',
            convertedOrderId: 'order-1',
          }),
        }),
      );
    });
  });
});

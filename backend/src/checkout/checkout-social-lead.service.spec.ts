import { CheckoutSocialProvider } from '@prisma/client';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';
import { FacebookAuthService } from '../auth/facebook-auth.service';
import { GoogleAuthService } from '../auth/google-auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../queue/queue', () => ({
  crmQueue: {
    add: jest.fn().mockResolvedValue(undefined),
  },
}));

function createAppleIdentityToken(payload: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
}

describe('CheckoutSocialLeadService', () => {
  const prisma = {
    checkoutProductPlan: {
      findUnique: jest.fn(),
    },
    checkoutSocialLead: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    contact: {
      upsert: jest.fn(),
    },
  };

  const googleAuthService = {
    verifyCredential: jest.fn(),
    fetchPeopleProfile: jest.fn(),
  };

  const facebookAuthService = {
    verifyAccessToken: jest.fn(),
  };

  let service: CheckoutSocialLeadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CheckoutSocialLeadService(
      prisma as unknown as PrismaService,
      googleAuthService as unknown as GoogleAuthService,
      facebookAuthService as unknown as FacebookAuthService,
    );
  });

  it('captures a Facebook checkout lead with a verified Meta access token', async () => {
    prisma.checkoutProductPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      slug: 'checkout-demo',
      productId: 'product-1',
      product: {
        workspaceId: 'ws-1',
      },
    });
    facebookAuthService.verifyAccessToken.mockResolvedValue({
      provider: 'facebook',
      providerId: 'facebook-user-123',
      email: 'buyer@example.com',
      name: 'Buyer Example',
      image: 'https://example.com/avatar.png',
      emailVerified: true,
    });
    prisma.checkoutSocialLead.create.mockResolvedValue({
      id: 'lead-1',
      provider: CheckoutSocialProvider.FACEBOOK,
      name: 'Buyer Example',
      email: 'buyer@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      deviceFingerprint: 'device-123',
      workspaceId: 'ws-1',
      checkoutSlug: 'checkout-demo',
    });

    const result = await service.captureLead({
      slug: 'checkout-demo',
      provider: 'facebook',
      accessToken: 'facebook-user-token',
      deviceFingerprint: 'device-123',
    });

    expect(facebookAuthService.verifyAccessToken).toHaveBeenCalledWith('facebook-user-token');
    expect(prisma.checkoutSocialLead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: CheckoutSocialProvider.FACEBOOK,
          providerId: 'facebook-user-123',
          name: 'Buyer Example',
          email: 'buyer@example.com',
          deviceFingerprint: 'device-123',
        }),
      }),
    );
    expect(result).toMatchObject({
      leadId: 'lead-1',
      provider: 'facebook',
      email: 'buyer@example.com',
      workspaceId: 'ws-1',
    });
  });

  it('captures an Apple checkout lead with the identity token payload and first-login profile data', async () => {
    prisma.checkoutProductPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      slug: 'checkout-demo',
      productId: 'product-1',
      product: {
        workspaceId: 'ws-1',
      },
    });
    prisma.checkoutSocialLead.create.mockResolvedValue({
      id: 'lead-apple',
      provider: CheckoutSocialProvider.APPLE,
      name: 'Ana Silva',
      email: 'ana@kloel.com',
      avatarUrl: null,
      deviceFingerprint: 'device-apple',
      workspaceId: 'ws-1',
      checkoutSlug: 'checkout-demo',
    });

    const result = await service.captureLead({
      slug: 'checkout-demo',
      provider: 'apple',
      identityToken: createAppleIdentityToken({
        sub: 'apple-user-123',
        email: 'ana@kloel.com',
        email_verified: true,
      }),
      user: {
        name: {
          firstName: 'Ana',
          lastName: 'Silva',
        },
      },
      deviceFingerprint: 'device-apple',
    });

    expect(prisma.checkoutSocialLead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: CheckoutSocialProvider.APPLE,
          providerId: 'apple-user-123',
          providerEmailVerified: true,
          name: 'Ana Silva',
          email: 'ana@kloel.com',
          deviceFingerprint: 'device-apple',
        }),
      }),
    );
    expect(result).toMatchObject({
      leadId: 'lead-apple',
      provider: 'apple',
      email: 'ana@kloel.com',
      workspaceId: 'ws-1',
    });
  });

  it('hydrates Google People fields including birthday into the checkout lead snapshot', async () => {
    prisma.checkoutSocialLead.findUnique.mockResolvedValueOnce({
      id: 'lead-google',
      workspaceId: 'ws-1',
      provider: CheckoutSocialProvider.GOOGLE,
      email: 'buyer@example.com',
      phone: null,
      enrichmentData: null,
    });
    googleAuthService.fetchPeopleProfile.mockResolvedValue({
      email: 'buyer@example.com',
      phone: '+5562999990000',
      birthday: '1994-04-18',
      address: {
        street: 'Rua das Flores, 100',
        city: 'Caldas Novas',
        state: 'GO',
        postalCode: '75690-000',
        countryCode: 'BR',
        formattedValue: 'Rua das Flores, 100, Caldas Novas - GO',
      },
      raw: {
        birthdays: [{ date: { year: 1994, month: 4, day: 18 } }],
      },
    });
    prisma.contact.upsert.mockResolvedValue({ id: 'contact-1' });
    prisma.checkoutSocialLead.update
      .mockResolvedValueOnce({
        id: 'lead-google',
        provider: CheckoutSocialProvider.GOOGLE,
        name: 'Buyer Example',
        email: 'buyer@example.com',
        avatarUrl: 'https://example.com/avatar.png',
        deviceFingerprint: 'device-123',
        phone: '5562999990000',
        cpf: null,
        enrichmentData: {
          googleProfile: {
            email: 'buyer@example.com',
            phone: '+5562999990000',
            birthday: '1994-04-18',
          },
          address: {
            street: 'Rua das Flores, 100',
            city: 'Caldas Novas',
            state: 'GO',
            postalCode: '75690-000',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'lead-google',
        contactId: 'contact-1',
      });

    const result = await service.hydrateGoogleProfile('lead-google', 'google-access-token');

    expect(googleAuthService.fetchPeopleProfile).toHaveBeenCalledWith('google-access-token');
    expect(prisma.checkoutSocialLead.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'lead-google' },
        data: expect.objectContaining({
          phone: '5562999990000',
          enrichmentData: expect.objectContaining({
            googleProfile: expect.objectContaining({
              birthday: '1994-04-18',
            }),
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      leadId: 'lead-google',
      provider: 'google',
      phone: '5562999990000',
      birthday: '1994-04-18',
      cep: '75690-000',
      city: 'Caldas Novas',
      state: 'GO',
    });
  });
});

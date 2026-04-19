import { ServiceUnavailableException } from '@nestjs/common';
import { MetaAuthController } from './meta-auth.controller';

describe('MetaAuthController', () => {
  const metaSdk = {
    exchangeToken: jest.fn(),
    graphApiGet: jest.fn(),
  } as any;

  const prisma = {
    metaConnection: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the Embedded Signup URL for an authenticated workspace', () => {
    const metaWhatsApp = {
      buildEmbeddedSignupUrl: jest.fn().mockReturnValue('https://www.facebook.com/dialog/oauth'),
      getOAuthRedirectUri: jest.fn(),
      discoverWhatsAppAssets: jest.fn(),
    } as any;

    const controller = new MetaAuthController(metaSdk, metaWhatsApp, prisma);

    const result = controller.getAuthUrl(
      {
        user: { sub: 'agent-1', workspaceId: 'ws-1' },
      } as any,
      'whatsapp',
      '/whatsapp',
    );

    expect(metaWhatsApp.buildEmbeddedSignupUrl).toHaveBeenCalledWith('ws-1', {
      channel: 'whatsapp',
      returnTo: '/whatsapp',
    });
    expect(result).toEqual({
      url: 'https://www.facebook.com/dialog/oauth',
    });
  });

  it('fails explicitly when Embedded Signup is not configured', () => {
    const metaWhatsApp = {
      buildEmbeddedSignupUrl: jest.fn().mockReturnValue(''),
      getOAuthRedirectUri: jest.fn(),
      discoverWhatsAppAssets: jest.fn(),
    } as any;

    const controller = new MetaAuthController(metaSdk, metaWhatsApp, prisma);

    expect(() =>
      controller.getAuthUrl(
        {
          user: { sub: 'agent-1', workspaceId: 'ws-1' },
        } as any,
        'whatsapp',
        '/whatsapp',
      ),
    ).toThrow(ServiceUnavailableException);
  });
});

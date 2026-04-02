import { ConfigService } from '@nestjs/config';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

describe('WhatsAppApiProvider', () => {
  let prisma: any;
  let metaWhatsApp: any;

  const createConfig = (overrides: Record<string, string | undefined> = {}) =>
    ({
      get: (key: string) => overrides[key],
    }) as ConfigService;

  beforeEach(() => {
    prisma = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ws-1' }),
      },
      contact: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    metaWhatsApp = {
      getPhoneNumberDetails: jest.fn(),
      sendTextMessage: jest.fn(),
      sendMediaMessage: jest.fn(),
    };
  });

  it('returns already_connected when Meta reports an active phone', async () => {
    metaWhatsApp.getPhoneNumberDetails.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
      phoneNumber: '5511999999999',
    });

    const provider = new WhatsAppApiProvider(prisma, createConfig(), metaWhatsApp);

    await expect(provider.startSession('ws-1')).resolves.toEqual({
      success: true,
      message: 'already_connected',
    });
  });

  it('returns embedded-signup guidance when Meta still needs authentication', async () => {
    metaWhatsApp.getPhoneNumberDetails.mockResolvedValue({
      connected: false,
      status: 'CONNECTION_INCOMPLETE',
      authUrl: 'https://meta.test/signup',
      degradedReason: 'meta_connection_required',
    });

    const provider = new WhatsAppApiProvider(prisma, createConfig(), metaWhatsApp);

    await expect(provider.startSession('ws-1')).resolves.toEqual({
      success: true,
      message: 'meta_connection_required',
      authUrl: 'https://meta.test/signup',
    });
    await expect(provider.getQrCode('ws-1')).resolves.toEqual({
      success: true,
      message: 'meta_cloud_use_embedded_signup',
    });
  });

  it('maps Meta phone details into the session status contract', async () => {
    metaWhatsApp.getPhoneNumberDetails.mockResolvedValue({
      connected: false,
      status: 'CONNECTION_INCOMPLETE',
      phoneNumber: '5511999999999',
      pushName: 'Loja Teste',
      selfIds: ['5511999999999@c.us'],
    });

    const provider = new WhatsAppApiProvider(prisma, createConfig(), metaWhatsApp);

    await expect(provider.getSessionStatus('ws-1')).resolves.toEqual({
      success: true,
      state: 'CONNECTION_INCOMPLETE',
      message: 'CONNECTION_INCOMPLETE',
      phoneNumber: '5511999999999',
      pushName: 'Loja Teste',
      selfIds: ['5511999999999@c.us'],
    });
  });

  it('lists the configured Meta phone number as the active session', async () => {
    const provider = new WhatsAppApiProvider(
      prisma,
      createConfig({ META_PHONE_NUMBER_ID: '1234567890' }),
      metaWhatsApp,
    );

    await expect(provider.listSessions()).resolves.toEqual([
      {
        name: '1234567890',
        success: true,
        rawStatus: 'CONNECTED',
        state: 'CONNECTED',
      },
    ]);
  });

  it('delegates text and media sending to Meta WhatsApp', async () => {
    metaWhatsApp.sendTextMessage.mockResolvedValue({
      success: true,
      messageId: 'msg-1',
    });
    metaWhatsApp.sendMediaMessage.mockResolvedValue({
      success: true,
      messageId: 'media-1',
    });

    const provider = new WhatsAppApiProvider(prisma, createConfig(), metaWhatsApp);

    await expect(provider.sendMessage('ws-1', '5511999999999', 'Oi')).resolves.toEqual({
      success: true,
      message: { id: 'msg-1' },
    });
    await expect(
      provider.sendMediaFromUrl(
        'ws-1',
        '5511999999999',
        'https://cdn.kloel.test/image.png',
        'Legenda',
      ),
    ).resolves.toEqual({
      success: true,
      message: { id: 'media-1' },
    });
  });
});

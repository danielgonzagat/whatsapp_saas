import { MetaConnectService } from './meta-connect.service';
import { createPartialPrismaMock } from '../../../test/helpers/prisma.mock';

describe('MetaConnectService', () => {
  let prismaMock: ReturnType<typeof createPartialPrismaMock>;
  let workspaceFindUnique: jest.Mock;
  let metaConnectionFindFirst: jest.Mock;
  const metaForWorkspace = jest.fn();
  const safeBuildEmbeddedSignupUrl = jest.fn();
  const getProviderType = jest.fn();
  const getSessionStatus = jest.fn();

  const metaWhatsAppMock = { safeBuildEmbeddedSignupUrl };

  const metaConnectionStateMock = { forWorkspace: metaForWorkspace };

  const whatsappProvidersMock = {
    getProviderType,
    getSessionStatus,
  };

  let service: MetaConnectService;

  const disconnectedMetaState = {
    metaConnected: false,
    channel: null,
    instagram: {
      connected: false,
      accountId: null,
      pageId: null,
      expiresAt: null,
    },
    facebook: {
      connected: false,
      pageId: null,
      expiresAt: null,
    },
    whatsapp: {
      connected: false,
      phoneNumberId: null,
      businessId: null,
      expiresAt: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock = createPartialPrismaMock({
      workspace: ['findUnique'],
      metaConnection: ['findFirst'],
    });
    workspaceFindUnique = prismaMock.workspace.findUnique;
    metaConnectionFindFirst = prismaMock.metaConnection.findFirst;

    safeBuildEmbeddedSignupUrl.mockReturnValue('https://auth.example.com/connect');
    metaForWorkspace.mockResolvedValue(disconnectedMetaState);
    getProviderType.mockResolvedValue('meta-cloud');
    getSessionStatus.mockResolvedValue(null);
    workspaceFindUnique.mockResolvedValue(null);
    metaConnectionFindFirst.mockResolvedValue(null);

    service = new MetaConnectService(
      prismaMock as never,
      metaWhatsAppMock as never,
      metaConnectionStateMock as never,
      whatsappProvidersMock as never,
    );
  });

  describe('getStatus', () => {
    const workspaceId = 'ws-test-1';
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    it('returns connected status when workspace has whatsappApiSession populated', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          whatsappApiSession: {
            status: 'connected',
            phoneNumber: '+5511999999999',
            pushName: 'Test User',
          },
        },
      });

      metaConnectionFindFirst.mockResolvedValue({
        status: 'active',
        pageId: 'page-1',
        pageName: 'Test Page',
        instagramAccountId: 'ig-1',
        instagramUsername: 'test_ig',
        whatsappPhoneNumberId: 'wpid-1',
        whatsappBusinessId: 'wba-1',
        adAccountId: 'ad-1',
        tokenExpiresAt: futureDate,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      metaForWorkspace.mockResolvedValue({
        metaConnected: true,
        channel: 'whatsapp',
        instagram: {
          connected: true,
          accountId: 'ig-1',
          pageId: 'page-1',
          expiresAt: futureDate,
        },
        facebook: {
          connected: true,
          pageId: 'page-1',
          expiresAt: futureDate,
        },
        whatsapp: {
          connected: true,
          phoneNumberId: 'wpid-1',
          businessId: 'wba-1',
          expiresAt: futureDate,
        },
      });

      getProviderType.mockResolvedValue('meta-cloud');

      getSessionStatus.mockResolvedValue({
        connected: true,
        status: 'connected',
        phoneNumber: '+5511999999999',
        pushName: 'Test User',
        phoneNumberId: 'wpid-1',
        whatsappBusinessId: 'wba-1',
      });

      const result = await service.getStatus(workspaceId);

      expect(result.meta.connected).toBe(true);
      expect(result.meta.tokenExpired).toBe(false);
      expect(result.meta.pageId).toBe('page-1');
      expect(result.meta.pageName).toBe('Test Page');
      expect(result.meta.instagramUsername).toBe('test_ig');
      expect(result.meta.updatedAt).toBe('2026-01-01T00:00:00.000Z');

      expect(result.whatsapp.provider).toBe('meta-cloud');
      expect(result.whatsapp.connected).toBe(true);
      expect(result.whatsapp.status).toBe('connected');
      expect(result.whatsapp.phoneNumber).toBe('+5511999999999');
      expect(result.whatsapp.pushName).toBe('Test User');
      expect(result.whatsapp.phoneNumberId).toBe('wpid-1');
      expect(result.whatsapp.whatsappBusinessId).toBe('wba-1');
      expect(result.whatsapp.degradedReason).toBeNull();

      expect(result.instagram.connected).toBe(true);
      expect(result.instagram.status).toBe('connected');

      expect(result.facebook.connected).toBe(true);
      expect(result.facebook.status).toBe('connected');
    });

    it('returns disconnected shape when providerSettings is empty', async () => {
      workspaceFindUnique.mockResolvedValue(null);

      const result = await service.getStatus(workspaceId);

      expect(result.meta.connected).toBe(false);
      expect(result.meta.tokenExpired).toBe(false);
      expect(result.meta.pageId).toBeNull();
      expect(result.meta.pageName).toBeNull();
      expect(result.meta.instagramUsername).toBeNull();
      expect(result.meta.updatedAt).toBeNull();

      expect(result.whatsapp.provider).toBe('meta-cloud');
      expect(result.whatsapp.connected).toBe(false);
      expect(result.whatsapp.status).toBe('disconnected');
      expect(result.whatsapp.authUrl).toBe('https://auth.example.com/connect');
      expect(result.whatsapp.phoneNumber).toBeNull();
      expect(result.whatsapp.pushName).toBeNull();
      expect(result.whatsapp.phoneNumberId).toBeNull();
      expect(result.whatsapp.whatsappBusinessId).toBeNull();
      expect(result.whatsapp.degradedReason).toBeNull();

      expect(result.instagram.connected).toBe(false);
      expect(result.instagram.status).toBe('disconnected');

      expect(result.facebook.connected).toBe(false);
      expect(result.facebook.status).toBe('disconnected');
    });

    it('returns clean disconnected shape when meta state is cleared and providers unregistered', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          whatsappApiSession: {
            status: 'disconnected',
            disconnectReason: 'Token revoked by user',
          },
        },
      });

      const result = await service.getStatus(workspaceId);

      expect(result.meta.connected).toBe(false);
      expect(result.meta.tokenExpired).toBe(false);
      expect(result.meta.pageId).toBeNull();
      expect(result.meta.pageName).toBeNull();
      expect(result.meta.instagramUsername).toBeNull();
      expect(result.meta.updatedAt).toBeNull();

      expect(result.whatsapp.provider).toBe('meta-cloud');
      expect(result.whatsapp.connected).toBe(false);
      expect(result.whatsapp.status).toBe('disconnected');
      expect(result.whatsapp.degradedReason).toBe('Token revoked by user');

      expect(result.instagram.connected).toBe(false);
      expect(result.facebook.connected).toBe(false);
    });

    it('propagates registry getSessionStatus raw status to response', async () => {
      getSessionStatus.mockResolvedValue({
        connected: false,
        status: 'scanned_refreshing',
        phoneNumber: '+5511888888888',
        pushName: 'Registry User',
        degradedReason: 'Session refresh in progress',
      });

      const result = await service.getStatus(workspaceId);

      expect(result.whatsapp.status).toBe('scanned_refreshing');
      expect(result.whatsapp.connected).toBe(false);
      expect(result.whatsapp.phoneNumber).toBe('+5511888888888');
      expect(result.whatsapp.pushName).toBe('Registry User');
      expect(result.whatsapp.degradedReason).toBe('Session refresh in progress');
    });

    it('scopes prisma workspace query to workspaceId for tenant isolation', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {},
      });

      await service.getStatus('ws-tenant');

      expect(workspaceFindUnique).toHaveBeenCalledWith({
        where: { id: 'ws-tenant' },
        select: { providerSettings: true },
      });
    });
  });
});

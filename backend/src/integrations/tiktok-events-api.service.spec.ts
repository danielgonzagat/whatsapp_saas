import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { TikTokEventsApiService } from './tiktok-events-api.service';

jest.mock('./tiktok-token-crypto', () => ({
  decryptTikTokToken: (s: string) => s,
}));

describe('TikTokEventsApiService', () => {
  let service: TikTokEventsApiService;
  let prisma: { workspace: { findUnique: jest.Mock } };
  let opsAlert: { alertOnDegradation: jest.Mock };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: { tiktok: { accessToken: 'token-abc' } },
        }),
      },
    };
    opsAlert = { alertOnDegradation: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TikTokEventsApiService,
        { provide: PrismaService, useValue: prisma },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();
    service = module.get(TikTokEventsApiService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns tiktok_token_not_configured when no access token', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ providerSettings: { tiktok: {} } });
    const result = await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {},
    });
    expect(result).toEqual({ success: false, error: 'tiktok_token_not_configured' });
  });

  it('hashes email/phone/externalId with sha256 before sending', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ json: async () => ({ code: 0, request_id: 'r1' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {
        email: 'TEST@Example.com',
        phone: '+5511999991234',
        externalId: 'user-123',
        ttclid: 'click-1',
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.context.user.email).toMatch(/^[a-f0-9]{64}$/);
    expect(body.context.user.phone).toMatch(/^[a-f0-9]{64}$/);
    expect(body.context.user.external_id).toMatch(/^[a-f0-9]{64}$/);
    // ttclid is NOT hashed
    expect(body.context.user.ttclid).toBe('click-1');
  });

  it('returns success=true when TikTok responds with code=0', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ json: async () => ({ code: 0, request_id: 'req-1' }) }) as unknown as typeof fetch;
    const result = await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: { email: 'a@a.com' },
    });
    expect(result.success).toBe(true);
    expect(result.requestId).toBe('req-1');
  });

  it('returns success=false and error message on non-zero TikTok code', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ json: async () => ({ code: 40001, message: 'bad', request_id: 'r2' }) }) as unknown as typeof fetch;
    const result = await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('bad');
    expect(opsAlert.alertOnDegradation).toHaveBeenCalled();
  });

  it('returns success=false on fetch exception (no throw)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const result = await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });

  it('targets the canonical TikTok Events API track URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ json: async () => ({ code: 0 }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {},
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://business-api.tiktok.com/open_api/v1.3/event/track/',
    );
    expect(fetchMock.mock.calls[0][1].headers['Access-Token']).toBe('token-abc');
  });

  it('sendEvents aggregates success/failure counts', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ code: 0 }) })
      .mockResolvedValueOnce({ json: async () => ({ code: 1, message: 'bad' }) })
      .mockResolvedValueOnce({ json: async () => ({ code: 0 }) }) as unknown as typeof fetch;

    const result = await service.sendEvents('ws-1', 'PX', [
      { eventName: 'A', userData: {} },
      { eventName: 'B', userData: {} },
      { eventName: 'C', userData: {} },
    ]);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.errors).toEqual(['bad']);
  });
});

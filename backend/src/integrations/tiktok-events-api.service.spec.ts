import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { TikTokEventsApiService } from './tiktok-events-api.service';

jest.mock('./tiktok-token-crypto', () => ({
  decryptTikTokToken: (s: string) => s,
}));

type TikTokFetchCall = [string, RequestInit];
type TikTokFetchResponse = { json: () => Promise<unknown> };
type TikTokFetchMock = jest.Mock<Promise<TikTokFetchResponse>, TikTokFetchCall>;
type TikTokTrackBody = {
  context: {
    user: {
      email?: string;
      phone?: string;
      external_id?: string;
      ttclid?: string;
    };
  };
};

function firstTikTokFetchCall(fetchMock: TikTokFetchMock): TikTokFetchCall {
  const call = fetchMock.mock.calls[0];
  if (!call) {
    throw new Error('expected TikTok fetch call');
  }
  return call;
}

function parseTikTokTrackBody(init: RequestInit): TikTokTrackBody {
  if (typeof init.body !== 'string') {
    throw new Error('expected TikTok JSON request body');
  }
  const parsed: unknown = JSON.parse(init.body);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('expected TikTok track JSON object');
  }
  return parsed as TikTokTrackBody;
}

describe('TikTokEventsApiService', () => {
  let service: TikTokEventsApiService;
  let prisma: { integrationCredential: { findUnique: jest.Mock } };
  let opsAlert: { alertOnDegradation: jest.Mock };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    prisma = {
      integrationCredential: {
        findUnique: jest.fn().mockResolvedValue({
          accessToken: 'token-abc',
          status: 'connected',
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
    prisma.integrationCredential.findUnique.mockResolvedValue(null);
    const result = await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {},
    });
    expect(result).toEqual({ success: false, error: 'tiktok_token_not_configured' });
  });

  it('hashes email/phone/externalId with sha256 before sending', async () => {
    const fetchMock: TikTokFetchMock = jest
      .fn<Promise<TikTokFetchResponse>, TikTokFetchCall>()
      .mockResolvedValue({ json: async () => ({ code: 0, request_id: 'r1' }) });
    global.fetch = fetchMock as typeof fetch;

    await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {
        email: 'TEST@Example.com',
        phone: '+5511999991234',
        externalId: 'user-123',
        ttclid: 'click-1',
      },
    });
    const [, init] = firstTikTokFetchCall(fetchMock);
    const body = parseTikTokTrackBody(init);
    expect(body.context.user.email).toMatch(/^[a-f0-9]{64}$/);
    expect(body.context.user.phone).toMatch(/^[a-f0-9]{64}$/);
    expect(body.context.user.external_id).toMatch(/^[a-f0-9]{64}$/);
    // ttclid is NOT hashed
    expect(body.context.user.ttclid).toBe('click-1');
  });

  it('returns success=true when TikTok responds with code=0', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ json: async () => ({ code: 0, request_id: 'req-1' }) }) as typeof fetch;
    const result = await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: { email: 'a@a.com' },
    });
    expect(result.success).toBe(true);
    expect(result.requestId).toBe('req-1');
  });

  it('returns success=false and error message on non-zero TikTok code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ code: 40001, message: 'bad', request_id: 'r2' }),
    }) as typeof fetch;
    const result = await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('bad');
    expect(opsAlert.alertOnDegradation).toHaveBeenCalled();
  });

  it('returns success=false on fetch exception (no throw)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;
    const result = await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });

  it('targets the canonical TikTok Events API track URL', async () => {
    const fetchMock: TikTokFetchMock = jest
      .fn<Promise<TikTokFetchResponse>, TikTokFetchCall>()
      .mockResolvedValue({ json: async () => ({ code: 0 }) });
    global.fetch = fetchMock as typeof fetch;
    await service.sendEvent('ws-1', 'PX', {
      eventName: 'Purchase',
      userData: {},
    });
    const [url, init] = firstTikTokFetchCall(fetchMock);
    expect(url).toBe('https://business-api.tiktok.com/open_api/v1.3/event/track/');
    expect((init.headers as Record<string, string>)['Access-Token']).toBe('token-abc');
  });

  it('sendEvents aggregates success/failure counts', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ code: 0 }) })
      .mockResolvedValueOnce({ json: async () => ({ code: 1, message: 'bad' }) })
      .mockResolvedValueOnce({ json: async () => ({ code: 0 }) }) as typeof fetch;

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

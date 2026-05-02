import { CookieConsentService } from './cookie-consent.service';

describe('CookieConsentService', () => {
  let prisma: {
    cookieConsent: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let service: CookieConsentService;

  const mockDate = new Date('2026-03-20T10:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);

    prisma = {
      cookieConsent: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    service = new CookieConsentService(
      prisma as unknown as ConstructorParameters<typeof CookieConsentService>[0],
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('normalize', () => {
    it('returns default values when no input is provided', () => {
      const result = service.normalize();

      expect(result).toEqual({
        necessary: true,
        analytics: false,
        marketing: false,
        updatedAt: mockDate.toISOString(),
      });
    });

    it('returns default values when input is null', () => {
      const result = service.normalize(null);

      expect(result).toEqual({
        necessary: true,
        analytics: false,
        marketing: false,
        updatedAt: mockDate.toISOString(),
      });
    });

    it('respects analytics and marketing from input', () => {
      const result = service.normalize({ analytics: true, marketing: true });

      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: true,
        updatedAt: mockDate.toISOString(),
      });
    });

    it('necessary is always true regardless of input', () => {
      const result = service.normalize({ necessary: false });

      expect(result.necessary).toBe(true);
    });

    it('coerces truthy values to boolean for analytics and marketing', () => {
      const result = service.normalize({ analytics: 1 as never, marketing: 'yes' as never });

      expect(result.analytics).toBe(true);
      expect(result.marketing).toBe(true);
    });

    it('coerces falsy values to boolean for analytics and marketing', () => {
      const result = service.normalize({
        analytics: undefined,
        marketing: undefined,
      });

      expect(result.analytics).toBe(false);
      expect(result.marketing).toBe(false);
    });
  });

  describe('parseCookieValue', () => {
    it('returns null for empty string', () => {
      expect(service.parseCookieValue('')).toBeNull();
      expect(service.parseCookieValue('   ')).toBeNull();
    });

    it('returns null for null or undefined', () => {
      expect(service.parseCookieValue(null)).toBeNull();
      expect(service.parseCookieValue(undefined)).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(service.parseCookieValue('not-json')).toBeNull();
      expect(service.parseCookieValue('{ broken }')).toBeNull();
    });

    it('parses valid JSON with analytics and marketing', () => {
      const result = service.parseCookieValue(
        JSON.stringify({ analytics: true, marketing: false }),
      );

      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: mockDate.toISOString(),
      });
    });

    it('preserves updatedAt when present in cookie value', () => {
      const customDate = '2025-01-15T08:30:00.000Z';
      const result = service.parseCookieValue(
        JSON.stringify({ analytics: true, updatedAt: customDate }),
      );

      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: customDate,
      });
    });

    it('ignores empty updatedAt and falls back to current time', () => {
      const result = service.parseCookieValue(JSON.stringify({ analytics: true, updatedAt: '' }));

      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: mockDate.toISOString(),
      });
    });

    it('parses cookie with only analytics consent', () => {
      const result = service.parseCookieValue(JSON.stringify({ analytics: true }));

      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: mockDate.toISOString(),
      });
    });
  });

  describe('serializeCookieValue', () => {
    it('serializes consent record to JSON string', () => {
      const record = {
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: '2026-03-20T10:00:00.000Z',
      };

      const result = service.serializeCookieValue(record);

      expect(result).toBe(JSON.stringify(record));
    });

    it('produces parsable output', () => {
      const record = {
        necessary: true,
        analytics: true,
        marketing: true,
        updatedAt: '2026-03-20T10:00:00.000Z',
      };

      const serialized = service.serializeCookieValue(record);
      const parsed = service.parseCookieValue(serialized);

      expect(parsed).toEqual(record);
    });
  });

  describe('getForAgent', () => {
    it('returns null when no consent record exists', async () => {
      prisma.cookieConsent.findUnique.mockResolvedValue(null);

      const result = await service.getForAgent('agent-1');

      expect(result).toBeNull();
      expect(prisma.cookieConsent.findUnique).toHaveBeenCalledWith({
        where: { agentId: 'agent-1' },
      });
    });

    it('returns mapped consent record when found', async () => {
      prisma.cookieConsent.findUnique.mockResolvedValue({
        agentId: 'agent-1',
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      });

      const result = await service.getForAgent('agent-1');

      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt: '2026-03-20T10:00:00.000Z',
      });
    });
  });

  describe('saveForAgent', () => {
    it('creates a new consent record via upsert', async () => {
      prisma.cookieConsent.upsert.mockResolvedValue({
        agentId: 'agent-1',
        necessary: true,
        analytics: true,
        marketing: true,
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      });

      const result = await service.saveForAgent('agent-1', {
        analytics: true,
        marketing: true,
      });

      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: true,
        updatedAt: '2026-03-20T10:00:00.000Z',
      });

      expect(prisma.cookieConsent.upsert).toHaveBeenCalledWith({
        where: { agentId: 'agent-1' },
        update: {
          necessary: true,
          analytics: true,
          marketing: true,
        },
        create: {
          agentId: 'agent-1',
          necessary: true,
          analytics: true,
          marketing: true,
        },
      });
    });

    it('uses normalized defaults when no input is provided', async () => {
      prisma.cookieConsent.upsert.mockResolvedValue({
        agentId: 'agent-1',
        necessary: true,
        analytics: false,
        marketing: false,
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      });

      const result = await service.saveForAgent('agent-1');

      expect(result).toEqual({
        necessary: true,
        analytics: false,
        marketing: false,
        updatedAt: '2026-03-20T10:00:00.000Z',
      });

      expect(prisma.cookieConsent.upsert).toHaveBeenCalledWith({
        where: { agentId: 'agent-1' },
        update: {
          necessary: true,
          analytics: false,
          marketing: false,
        },
        create: {
          agentId: 'agent-1',
          necessary: true,
          analytics: false,
          marketing: false,
        },
      });
    });

    it('updates existing consent with new preferences', async () => {
      prisma.cookieConsent.upsert.mockResolvedValue({
        agentId: 'agent-2',
        necessary: true,
        analytics: false,
        marketing: true,
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      });

      const result = await service.saveForAgent('agent-2', {
        analytics: false,
        marketing: true,
      });

      expect(result).toEqual({
        necessary: true,
        analytics: false,
        marketing: true,
        updatedAt: '2026-03-20T10:00:00.000Z',
      });
    });
  });
});

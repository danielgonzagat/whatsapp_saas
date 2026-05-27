import { MetaConversionsApiService } from './meta-conversions-api.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('MetaConversionsApiService', () => {
  describe('hashEmail', () => {
    it('hashes an email to SHA-256', () => {
      const hash = MetaConversionsApiService.hashEmail('test@example.com');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('always lowercases before hashing', () => {
      const lower = MetaConversionsApiService.hashEmail('TEST@Example.COM');
      const upper = MetaConversionsApiService.hashEmail('test@example.com');
      expect(lower).toBe(upper);
    });

    it('trims whitespace before hashing', () => {
      const trimmed = MetaConversionsApiService.hashEmail('  test@example.com  ');
      const normal = MetaConversionsApiService.hashEmail('test@example.com');
      expect(trimmed).toBe(normal);
    });

    it('returns empty string for empty input', () => {
      expect(MetaConversionsApiService.hashEmail('')).toBe('');
      expect(MetaConversionsApiService.hashEmail('  ')).toBe('');
    });

    it('returns empty string for null/undefined', () => {
      expect(MetaConversionsApiService.hashEmail(null as string)).toBe('');
      expect(MetaConversionsApiService.hashEmail(undefined as string)).toBe('');
    });

    it('produces consistent hashes', () => {
      const hash1 = MetaConversionsApiService.hashEmail('user@kloel.com');
      const hash2 = MetaConversionsApiService.hashEmail('user@kloel.com');
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different emails', () => {
      const hash1 = MetaConversionsApiService.hashEmail('user1@kloel.com');
      const hash2 = MetaConversionsApiService.hashEmail('user2@kloel.com');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashPhone', () => {
    it('hashes a phone number to SHA-256', () => {
      const hash = MetaConversionsApiService.hashPhone('+5511999999999');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('normalizes phone before hashing', () => {
      const hash1 = MetaConversionsApiService.hashPhone('5511999999999');
      const hash2 = MetaConversionsApiService.hashPhone('+5511999999999');
      expect(hash1).not.toBe(hash2);
    });

    it('returns empty string for empty phone', () => {
      expect(MetaConversionsApiService.hashPhone('')).toBe('');
    });
  });

  describe('sendEvent', () => {
    let service: MetaConversionsApiService;
    let mockPrisma: ReturnType<typeof createPartialPrismaMock>;
    let mockMetaSdk: { graphApiGet: jest.Mock };
    let mockOpsAlert: { alertOnCriticalError: jest.Mock };

    beforeEach(() => {
      process.env.META_TEST_EVENT_CODE = 'TEST_EVENT_CODE_123';

      mockPrisma = createPartialPrismaMock({
        metaConnection: ['findFirst'],
      });

      mockMetaSdk = {
        graphApiGet: jest.fn(),
      };

      mockOpsAlert = {
        alertOnCriticalError: jest.fn(),
      };

      service = new MetaConversionsApiService(
        mockPrisma as never,
        mockMetaSdk as never,
        mockOpsAlert,
      );
    });

    afterEach(() => {
      delete process.env.META_TEST_EVENT_CODE;
    });

    it('returns no_meta_connection when workspace has no MetaConnection', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue(null);

      const result = await service.sendEvent('ws-no-conn', 'pixel-123', {
        eventName: 'Purchase',
        userData: { email: 'buyer@kloel.com' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('no_meta_connection');
    });

    it('returns error when no access token on connection', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        accessToken: null,
      });

      const result = await service.sendEvent('ws-empty', 'pixel-123', {
        eventName: 'ViewContent',
        userData: { email: 'viewer@kloel.com' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('no_meta_connection');
    });

    it('generates an event_id when not provided', async () => {
      (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events_received: 1 }),
      });

      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        accessToken: 'test-access-token',
      });

      const result = await service.sendEvent('ws-1', 'pixel-123', {
        eventName: 'Lead',
        userData: { email: 'lead@kloel.com' },
      });

      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.eventId).not.toBe('');

      delete (globalThis as { fetch?: unknown }).fetch;
    });

    it('uses provided event_id when given', async () => {
      (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events_received: 1 }),
      });

      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        accessToken: 'test-access-token',
      });

      const result = await service.sendEvent('ws-1', 'pixel-123', {
        eventName: 'Purchase',
        eventId: 'custom-event-id-456',
        userData: { email: 'buyer@kloel.com' },
      });

      expect(result.eventId).toBe('custom-event-id-456');

      delete (globalThis as { fetch?: unknown }).fetch;
    });
  });
});

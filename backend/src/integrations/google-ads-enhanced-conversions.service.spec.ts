import { PrismaService } from '../prisma/prisma.service';
import { GoogleAdsEnhancedConversionsService } from './google-ads-enhanced-conversions.service';

describe('GoogleAdsEnhancedConversionsService', () => {
  const findUnique = jest.fn();
  const prisma = {
    integrationCredential: { findUnique },
  };

  const service = new GoogleAdsEnhancedConversionsService(prisma as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-dev-token';
  });

  afterEach(() => {
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  });

  describe('uploadConversion', () => {
    it('returns error when no connection found', async () => {
      findUnique.mockResolvedValue(null);
      const result = await service.uploadConversion('ws-1', 'customer-1', {
        conversionActionId: 'action-1',
        userData: { email: 'test@example.com' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('no_google_ads_connection');
    });

    it('returns error when developer token not configured', async () => {
      delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      findUnique.mockResolvedValue({ accessToken: 'encrypted-token', loginCustomerId: 'cid-1' });
      const result = await service.uploadConversion('ws-1', 'customer-1', {
        conversionActionId: 'action-1',
        userData: { email: 'test@example.com' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('developer_token_not_configured');
    });
  });

  describe('hashEmail', () => {
    it('returns sha256 hash of normalized email', () => {
      const hash = GoogleAdsEnhancedConversionsService.hashEmail('Test@Example.COM');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(hash).toBe(GoogleAdsEnhancedConversionsService.hashEmail('test@example.com'));
    });

    it('returns empty string for empty input', () => {
      expect(GoogleAdsEnhancedConversionsService.hashEmail('')).toBe('');
      expect(GoogleAdsEnhancedConversionsService.hashEmail(null as string)).toBe('');
      expect(GoogleAdsEnhancedConversionsService.hashEmail(undefined as string)).toBe(
        '',
      );
    });
  });

  describe('hashPhone', () => {
    it('returns sha256 hash of normalized phone', () => {
      const hash = GoogleAdsEnhancedConversionsService.hashPhone('+55 (11) 99999-0000');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('returns empty string for empty input', () => {
      expect(GoogleAdsEnhancedConversionsService.hashPhone('')).toBe('');
    });
  });
});

import { WhatsappMediaService } from './whatsapp-media.service';

describe('WhatsappMediaService', () => {
  let service: WhatsappMediaService;

  beforeEach(() => {
    service = new WhatsappMediaService();
  });

  describe('normalizeNumber', () => {
    it('strips non-digits from phone number', () => {
      expect(service.normalizeNumber('+55 (11) 99999-9999')).toBe('5511999999999');
      expect(service.normalizeNumber('123-456-7890')).toBe('1234567890');
      expect(service.normalizeNumber('1.800.555.0199')).toBe('18005550199');
    });

    it('returns same string when already only digits', () => {
      expect(service.normalizeNumber('5511999999999')).toBe('5511999999999');
    });

    it('handles empty string', () => {
      expect(service.normalizeNumber('')).toBe('');
    });
  });

  describe('normalizeChatId', () => {
    it('appends @c.us suffix when no @ present', () => {
      expect(service.normalizeChatId('5511999999999')).toBe('5511999999999@c.us');
    });

    it('strips non-digits and appends @c.us when no @ present', () => {
      expect(service.normalizeChatId('+55 11 99999-9999')).toBe('5511999999999@c.us');
    });

    it('preserves chat ID that already contains @', () => {
      expect(service.normalizeChatId('5511999999999@c.us')).toBe('5511999999999@c.us');
      expect(service.normalizeChatId('5511888888888@g.us')).toBe('5511888888888@g.us');
      expect(service.normalizeChatId('status@broadcast')).toBe('status@broadcast');
    });

    it('handles empty string gracefully', () => {
      expect(service.normalizeChatId('')).toBe('@c.us');
    });

    it('handles empty string with whitespace correctly', () => {
      expect(service.normalizeChatId('   ')).toBe('@c.us');
    });
  });
});

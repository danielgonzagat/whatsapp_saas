import { WhatsappMediaService } from './whatsapp-media.service';

describe('WhatsappMediaService', () => {
  const svc = new WhatsappMediaService();

  describe('normalizeNumber', () => {
    it('strips all non-digit characters', () => {
      expect(svc.normalizeNumber('+55 (11) 99999-1234')).toBe('5511999991234');
    });

    it('returns empty string for purely non-digit input', () => {
      expect(svc.normalizeNumber('abc-xyz')).toBe('');
    });

    it('preserves digit-only input', () => {
      expect(svc.normalizeNumber('5511999991234')).toBe('5511999991234');
    });
  });

  describe('normalizeChatId', () => {
    it('appends @c.us suffix when missing', () => {
      expect(svc.normalizeChatId('5511999991234')).toBe('5511999991234@c.us');
    });

    it('keeps chat id intact when already contains @', () => {
      expect(svc.normalizeChatId('1234@g.us')).toBe('1234@g.us');
    });

    it('handles null-ish input safely', () => {
      expect(svc.normalizeChatId('' as unknown as string)).toBe('@c.us');
    });

    it('normalizes formatted numbers before appending suffix', () => {
      expect(svc.normalizeChatId('+55 (11) 99999-1234')).toBe('5511999991234@c.us');
    });
  });
});

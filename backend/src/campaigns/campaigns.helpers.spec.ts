import {
  buildCampaignDeliveryGap,
  buildVariantFallbackCopy,
  computeCampaignDeliveryReadiness,
  computeSmartTimeDelayMs,
  scoreCampaignStats,
  validateVariantCopy,
} from './campaigns.helpers';

describe('campaigns.helpers', () => {
  describe('computeSmartTimeDelayMs', () => {
    it('delays to the next peak hour later today', () => {
      const now = new Date('2026-05-28T08:00:00Z');
      now.setHours(10);
      const delay = computeSmartTimeDelayMs(now, 14);
      expect(delay).toBe(4 * 60 * 60 * 1000);
    });

    it('wraps to tomorrow when peak hour already passed', () => {
      const now = new Date();
      now.setHours(18);
      const delay = computeSmartTimeDelayMs(now, 9);
      expect(delay).toBe((24 + 9 - 18) * 60 * 60 * 1000);
    });

    it('wraps to tomorrow when peak hour equals current hour', () => {
      const now = new Date();
      now.setHours(12);
      const delay = computeSmartTimeDelayMs(now, 12);
      expect(delay).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('scoreCampaignStats', () => {
    it('returns 0 when sent is zero or missing', () => {
      expect(scoreCampaignStats({})).toBe(0);
      expect(scoreCampaignStats({ sent: 0, replied: 5 })).toBe(0);
      expect(scoreCampaignStats(null)).toBe(0);
    });

    it('returns replied / sent ratio', () => {
      expect(scoreCampaignStats({ sent: 100, replied: 25 })).toBe(0.25);
    });
  });

  describe('computeCampaignDeliveryReadiness', () => {
    const base = {
      providerSettings: null,
      metaConnection: null,
      metaWhatsAppAvailable: false,
      emailProviderAvailable: false,
      now: new Date('2026-05-28T00:00:00Z'),
    } as const;

    it('returns all false when nothing is configured', () => {
      expect(computeCampaignDeliveryReadiness(base)).toEqual({
        emailReady: false,
        whatsappReady: false,
      });
    });

    it('requires both opt-in and provider env for email', () => {
      expect(
        computeCampaignDeliveryReadiness({
          ...base,
          providerSettings: { email: { enabled: true } },
          emailProviderAvailable: false,
        }).emailReady,
      ).toBe(false);

      expect(
        computeCampaignDeliveryReadiness({
          ...base,
          providerSettings: { email: { enabled: true } },
          emailProviderAvailable: true,
        }).emailReady,
      ).toBe(true);
    });

    it('treats legacy WhatsApp Web session as ready', () => {
      const out = computeCampaignDeliveryReadiness({
        ...base,
        metaWhatsAppAvailable: true,
        providerSettings: { whatsappApiSession: { status: 'connected' } },
      });
      expect(out.whatsappReady).toBe(true);
    });

    it('treats official Meta Cloud connection as ready when token not expired', () => {
      const out = computeCampaignDeliveryReadiness({
        ...base,
        metaWhatsAppAvailable: true,
        metaConnection: {
          whatsappPhoneNumberId: 'phone-1',
          status: 'connected',
          tokenExpiresAt: new Date('2099-01-01T00:00:00Z'),
        },
      });
      expect(out.whatsappReady).toBe(true);
    });

    it('rejects expired Meta tokens', () => {
      const out = computeCampaignDeliveryReadiness({
        ...base,
        metaWhatsAppAvailable: true,
        metaConnection: {
          whatsappPhoneNumberId: 'phone-1',
          status: 'connected',
          tokenExpiresAt: new Date('2020-01-01T00:00:00Z'),
        },
      });
      expect(out.whatsappReady).toBe(false);
    });

    it('requires metaWhatsAppAvailable to be true', () => {
      const out = computeCampaignDeliveryReadiness({
        ...base,
        metaWhatsAppAvailable: false,
        metaConnection: {
          whatsappPhoneNumberId: 'phone-1',
          status: 'connected',
          tokenExpiresAt: new Date('2099-01-01T00:00:00Z'),
        },
      });
      expect(out.whatsappReady).toBe(false);
    });
  });

  describe('buildCampaignDeliveryGap', () => {
    it('returns null when at least one channel is ready', () => {
      expect(buildCampaignDeliveryGap({ emailReady: true, whatsappReady: false })).toBeNull();
      expect(buildCampaignDeliveryGap({ emailReady: false, whatsappReady: true })).toBeNull();
    });

    it('lists both missing channels when nothing is ready', () => {
      const gap = buildCampaignDeliveryGap({ emailReady: false, whatsappReady: false });
      expect(gap).not.toBeNull();
      expect(gap?.missing).toHaveLength(2);
      expect(gap?.message).toContain('Conecte um canal de entrega');
      expect(gap?.message).toContain('email.enabled=true');
      expect(gap?.message).toContain('Meta Cloud WhatsApp');
    });
  });

  describe('buildVariantFallbackCopy', () => {
    it('appends CTA line with 1-based variant index', () => {
      expect(buildVariantFallbackCopy('Hello', 0)).toBe(
        'Hello [variante 1 com CTA: responda SIM agora]',
      );
      expect(buildVariantFallbackCopy('Hi', 2)).toBe('Hi [variante 3 com CTA: responda SIM agora]');
    });

    it('tolerates empty / null bases', () => {
      expect(buildVariantFallbackCopy('', 0)).toBe(' [variante 1 com CTA: responda SIM agora]');
      expect(buildVariantFallbackCopy(null, 0)).toBe(' [variante 1 com CTA: responda SIM agora]');
      expect(buildVariantFallbackCopy(undefined, 0)).toBe(
        ' [variante 1 com CTA: responda SIM agora]',
      );
    });
  });

  describe('validateVariantCopy', () => {
    it('returns base when variant is empty', () => {
      expect(validateVariantCopy('original', '')).toBe('original');
    });

    it('accepts variant within 3x cap', () => {
      const base = 'Olá!';
      const variant = 'Olá, como vai? Responda agora!';
      expect(validateVariantCopy(base, variant)).toBe(variant);
    });

    it('uses 280 floor for short bases', () => {
      const base = 'oi';
      const variant = 'a'.repeat(250);
      expect(validateVariantCopy(base, variant)).toBe(variant);
    });

    it('rejects variants larger than max(base*3, 280)', () => {
      const base = 'a'.repeat(200);
      const oversized = 'b'.repeat(700);
      expect(validateVariantCopy(base, oversized)).toBe(base);
    });
  });
});

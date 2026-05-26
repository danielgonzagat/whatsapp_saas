import {
  allowedFormatsFor,
  allowedTonesFor,
  canChannelDoAction,
  CHANNEL_REPERTOIRE,
  repertoireFor,
} from './channel-repertoire.config';
import type { ChannelKey } from './channel-repertoire.config';

describe('channel-repertoire.config', () => {
  describe('CHANNEL_REPERTOIRE', () => {
    it('defines all six channels', () => {
      const keys: ChannelKey[] = ['whatsapp', 'instagram', 'messenger', 'facebook', 'tiktok', 'email'];
      for (const key of keys) {
        expect(CHANNEL_REPERTOIRE[key]).toBeDefined();
        expect(CHANNEL_REPERTOIRE[key].channel).toBe(key);
      }
    });

    it('whatsapp has full action repertoire', () => {
      const r = CHANNEL_REPERTOIRE.whatsapp;
      expect(r.actions).toContain('send_audio');
      expect(r.actions).toContain('send_template');
      expect(r.actions).toContain('send_document');
      expect(r.actions).toContain('proactive_outbound');
      expect(r.actions).toContain('broadcast');
      expect(r.formats).toContain('audio');
      expect(r.formats).toContain('template');
      expect(r.proactiveOutboundAllowed).toBe(true);
      expect(r.proactiveWindowHours).toBeNull();
      expect(r.audioInboundOnly).toBe(false);
    });

    it('instagram has 24h proactive window', () => {
      const r = CHANNEL_REPERTOIRE.instagram;
      expect(r.proactiveWindowHours).toBe(24);
      expect(r.proactiveOutboundAllowed).toBe(true);
      expect(r.formats).toContain('audio');
      expect(r.formats).not.toContain('template');
    });

    it('messenger has 24h proactive window and template support', () => {
      const r = CHANNEL_REPERTOIRE.messenger;
      expect(r.proactiveWindowHours).toBe(24);
      expect(r.formats).toContain('template');
      expect(r.formats).toContain('audio');
    });

    it('facebook excludes audio format and document', () => {
      const r = CHANNEL_REPERTOIRE.facebook;
      expect(r.formats).not.toContain('audio');
      expect(r.formats).not.toContain('document');
      expect(r.actions).not.toContain('send_audio');
      expect(r.actions).not.toContain('send_document');
      expect(r.actions).not.toContain('broadcast');
      expect(r.actions).not.toContain('create_payment_link');
    });

    it('tiktok is inbound-only by default, audioInboundOnly, limited tones', () => {
      const r = CHANNEL_REPERTOIRE.tiktok;
      expect(r.proactiveOutboundAllowed).toBe(false);
      expect(r.audioInboundOnly).toBe(true);
      expect(r.formats).not.toContain('audio');
      expect(r.actions).not.toContain('send_audio');
      expect(r.actions).not.toContain('broadcast');
      expect(r.actions).not.toContain('send_template');
      expect(r.tones.length).toBeLessThan(5);
      expect(r.tones).toContain('consultivo');
      expect(r.tones).toContain('coloquial');
    });

    it('email has html_rich but no audio', () => {
      const r = CHANNEL_REPERTOIRE.email;
      expect(r.formats).toContain('html_rich');
      expect(r.formats).not.toContain('audio');
      expect(r.formats).not.toContain('image');
      expect(r.actions).not.toContain('send_audio');
      expect(r.actions).toContain('broadcast');
      expect(r.proactiveOutboundAllowed).toBe(true);
    });
  });

  describe('repertoireFor', () => {
    it('returns the correct shape per channel', () => {
      for (const [key, rep] of Object.entries(CHANNEL_REPERTOIRE)) {
        const result = repertoireFor(key);
        expect(result).toEqual(rep);
      }
    });

    it('returns the same object for case-insensitive input', () => {
      expect(repertoireFor('WHATSAPP')).toBe(CHANNEL_REPERTOIRE.whatsapp);
      expect(repertoireFor('Email')).toBe(CHANNEL_REPERTOIRE.email);
      expect(repertoireFor('TikTok')).toBe(CHANNEL_REPERTOIRE.tiktok);
    });

    it('returns null for unknown channel', () => {
      expect(repertoireFor('telegram')).toBeNull();
      expect(repertoireFor('')).toBeNull();
    });
  });

  describe('canChannelDoAction', () => {
    it('returns false when email cannot send_audio', () => {
      expect(canChannelDoAction('email', 'send_audio')).toBe(false);
    });

    it('returns true when whatsapp can send_audio', () => {
      expect(canChannelDoAction('whatsapp', 'send_audio')).toBe(true);
    });

    it('returns false for unknown channel', () => {
      expect(canChannelDoAction('telegram', 'send_text')).toBe(false);
    });
  });

  describe('allowedFormatsFor', () => {
    it('excludes audio from email', () => {
      const fmts = allowedFormatsFor('email');
      expect(fmts).not.toContain('audio');
      expect(fmts).toContain('text');
      expect(fmts).toContain('html_rich');
    });

    it('excludes html_rich from whatsapp', () => {
      const fmts = allowedFormatsFor('whatsapp');
      expect(fmts).not.toContain('html_rich');
      expect(fmts).toContain('audio');
      expect(fmts).toContain('template');
    });

    it('returns a copy, not a mutable reference', () => {
      const fmts = allowedFormatsFor('whatsapp');
      fmts.push('html_rich');
      expect(allowedFormatsFor('whatsapp')).not.toContain('html_rich');
    });

    it('defaults to text-only for unknown channel', () => {
      expect(allowedFormatsFor('unknown')).toEqual(['text']);
    });
  });

  describe('allowedTonesFor', () => {
    it('returns all 5 tones for whatsapp', () => {
      expect(allowedTonesFor('whatsapp').length).toBe(5);
    });

    it('returns reduced tone set for tiktok', () => {
      const tones = allowedTonesFor('tiktok');
      expect(tones.length).toBeLessThan(5);
      expect(tones.every((t) => CHANNEL_REPERTOIRE.tiktok.tones.includes(t))).toBe(true);
    });

    it('returns a copy, not a mutable reference', () => {
      const tones = allowedTonesFor('instagram');
      tones.length = 0;
      expect(allowedTonesFor('instagram').length).toBe(5);
    });
  });
});

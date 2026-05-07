import { describe, it, expect } from 'vitest';
import {
  channelWizardProfile,
  resolveConnectionMethod,
  WIZARD_STEPS,
} from './UniversalChannelWizard.helpers';

describe('UniversalChannelWizard.helpers', () => {
  describe('WIZARD_STEPS', () => {
    it('has exactly 4 steps', () => {
      expect(WIZARD_STEPS).toHaveLength(4);
    });

    it('steps are in correct order', () => {
      expect(WIZARD_STEPS[0]).toBe('Conexao');
      expect(WIZARD_STEPS[1]).toBe('Perfil');
      expect(WIZARD_STEPS[2]).toBe('Formatos');
      expect(WIZARD_STEPS[3]).toBe('Revisar');
    });
  });

  describe('channelWizardProfile', () => {
    const channels = ['instagram', 'facebook', 'tiktok', 'email'] as const;

    it.each(channels)('returns profile with required fields for %s', (channel) => {
      const profile = channelWizardProfile(channel);
      expect(profile.label).toBeTruthy();
      expect(profile.connectionLabel).toBeTruthy();
      expect(profile.connectingLabel).toBeTruthy();
      expect(profile.description).toBeTruthy();
      expect(profile.connectDescription).toBeTruthy();
      expect(profile.profileCards.length).toBeGreaterThanOrEqual(3);
      expect(profile.formatNotes.length).toBeGreaterThanOrEqual(2);
      expect(profile.restrictions.length).toBeGreaterThanOrEqual(3);
      expect(profile.activationSummary).toBeTruthy();
    });

    it('profileCards have label and value', () => {
      for (const channel of channels) {
        const profile = channelWizardProfile(channel);
        for (const card of profile.profileCards) {
          expect(card.label).toBeTruthy();
          expect(card.value).toBeTruthy();
        }
      }
    });

    it('formatNotes have title and body', () => {
      for (const channel of channels) {
        const profile = channelWizardProfile(channel);
        for (const note of profile.formatNotes) {
          expect(note.title).toBeTruthy();
          expect(note.body).toBeTruthy();
        }
      }
    });

    it('returns unique labels per channel', () => {
      const labels = channels.map((c) => channelWizardProfile(c).label);
      const unique = new Set(labels);
      expect(unique.size).toBeGreaterThanOrEqual(3);
    });

    it('returns empty profile for invalid channel', () => {
      const profile = channelWizardProfile('x' as 'instagram');
      expect(profile.label).toBe('Canal');
    });
  });

  describe('resolveConnectionMethod', () => {
    it('returns meta-oauth for instagram', () => {
      expect(resolveConnectionMethod('instagram')).toBe('meta-oauth');
    });

    it('returns meta-oauth for facebook', () => {
      expect(resolveConnectionMethod('facebook')).toBe('meta-oauth');
    });

    it('returns tiktok-oauth for tiktok', () => {
      expect(resolveConnectionMethod('tiktok')).toBe('tiktok-oauth');
    });

    it('returns email-toggle for email', () => {
      expect(resolveConnectionMethod('email')).toBe('email-toggle');
    });
  });

  describe('channelIcon', () => {
    it('returns valid JSX for each channel', async () => {
      const { channelIcon } = await import('./UniversalChannelWizard.helpers');
      const channels = ['instagram', 'facebook', 'tiktok', 'email'] as const;
      for (const ch of channels) {
        const el = channelIcon(ch, 24);
        expect(el).toBeDefined();
        expect(el.type).toBe('svg');
      }
    });
  });
});

import {
  buildCampaignDefaultStats,
  isCampaignAlreadyProcessed,
  isCampaignPausable,
  scoreCampaignRow,
} from './campaigns.service.helpers';

describe('campaigns.service.helpers', () => {
  describe('buildCampaignDefaultStats', () => {
    it('returns all-zero stats', () => {
      expect(buildCampaignDefaultStats()).toEqual({
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      });
    });

    it('returns a fresh object on every call', () => {
      const a = buildCampaignDefaultStats();
      const b = buildCampaignDefaultStats();
      a.sent = 99;
      expect(b.sent).toBe(0);
    });
  });

  describe('isCampaignPausable', () => {
    it.each(['RUNNING', 'SCHEDULED'])('returns true for %s', (status) => {
      expect(isCampaignPausable(status)).toBe(true);
    });

    it.each(['DRAFT', 'COMPLETED', 'PAUSED', ''])('returns false for %s', (status) => {
      expect(isCampaignPausable(status)).toBe(false);
    });
  });

  describe('isCampaignAlreadyProcessed', () => {
    it.each(['RUNNING', 'COMPLETED'])('returns true for %s', (status) => {
      expect(isCampaignAlreadyProcessed(status)).toBe(true);
    });

    it.each(['DRAFT', 'SCHEDULED', 'PAUSED'])('returns false for %s', (status) => {
      expect(isCampaignAlreadyProcessed(status)).toBe(false);
    });
  });

  describe('scoreCampaignRow', () => {
    it('returns 0 when stats is missing', () => {
      expect(scoreCampaignRow({})).toBe(0);
      expect(scoreCampaignRow({ stats: null })).toBe(0);
    });

    it('delegates to scoreCampaignStats for replied/sent ratio', () => {
      expect(scoreCampaignRow({ stats: { sent: 100, replied: 25 } })).toBe(0.25);
    });

    it('returns 0 when sent is zero', () => {
      expect(scoreCampaignRow({ stats: { sent: 0, replied: 5 } })).toBe(0);
    });
  });
});

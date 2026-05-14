import { extractChannel, getBeliefByChannel, requireChannel } from './mind-belief-by-channel';
import type { MindBeliefService } from './mind-belief.service';

function mockBeliefService(returnValue = {}) {
  return {
    getOrInit: jest.fn().mockResolvedValue(returnValue),
  } as unknown as MindBeliefService;
}

describe('mind-belief-by-channel', () => {
  describe('getBeliefByChannel', () => {
    it('calls getOrInit with channel merged into context', async () => {
      const beliefs = mockBeliefService({ id: 'b1', workspaceId: 'ws-1', mean: 0.5 });
      const result = await getBeliefByChannel(
        beliefs,
        'ws-1',
        'whatsapp',
        'contact:1',
        'P(reply)',
        { hour: 14 },
      );

      expect(result).toMatchObject({ id: 'b1', workspaceId: 'ws-1', mean: 0.5 });
      expect(beliefs.getOrInit).toHaveBeenCalledWith(
        'ws-1',
        'contact:1',
        'P(reply)',
        { hour: 14, channel: 'whatsapp' },
      );
    });

    it('throws when channel is empty', async () => {
      const beliefs = mockBeliefService();
      await expect(
        getBeliefByChannel(beliefs, 'ws-1', '', 's', 'p', {}),
      ).rejects.toThrow('channel is required');
    });
  });

  describe('requireChannel', () => {
    it('returns channel when provided', () => {
      expect(requireChannel('whatsapp')).toBe('whatsapp');
    });

    it('throws when channel is undefined', () => {
      expect(() => requireChannel(undefined)).toThrow('channel is required');
    });

    it('throws when channel is empty string', () => {
      expect(() => requireChannel('')).toThrow('channel is required');
    });
  });

  describe('extractChannel', () => {
    it('extracts channel from context object', () => {
      expect(extractChannel({ channel: 'whatsapp', tone: 'CONSULTIVE' })).toBe('whatsapp');
    });

    it('returns undefined when channel is not present', () => {
      expect(extractChannel({ tone: 'CONSULTIVE' })).toBeUndefined();
    });

    it('returns undefined for empty context', () => {
      expect(extractChannel({})).toBeUndefined();
    });
  });
});

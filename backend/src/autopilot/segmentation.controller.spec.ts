import { SegmentationController } from './segmentation.controller';

describe('SegmentationController', () => {
  const getAvailablePresets = jest.fn();
  const getPresetSegment = jest.fn();
  const getAudienceBySegment = jest.fn();
  const calculateEngagementScore = jest.fn();
  const autoSegmentWorkspace = jest.fn();

  let controller: SegmentationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SegmentationController({
      getAvailablePresets,
      getPresetSegment,
      getAudienceBySegment,
      calculateEngagementScore,
      autoSegmentWorkspace,
    } as never);
  });

  describe('getPresets', () => {
    it('returns preset list from service', () => {
      const presets = [
        { name: 'HOT_LEADS', description: 'Leads quentes', criteria: { engagement: 'hot' } as never },
      ];
      getAvailablePresets.mockReturnValue(presets);

      const result = controller.getPresets();

      expect(getAvailablePresets).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ presets });
    });
  });

  describe('querySegment', () => {
    it('calls service with workspaceId and criteria from body', async () => {
      const criteria = { tags: ['vip'], limit: 10 };
      const segmentResult = { contacts: [], total: 0, criteria };
      getAudienceBySegment.mockResolvedValue(segmentResult);

      const result = await controller.querySegment('ws-1', criteria);

      expect(getAudienceBySegment).toHaveBeenCalledWith('ws-1', criteria);
      expect(result).toEqual(segmentResult);
    });
  });

  describe('getContactScore', () => {
    it('passes contactId and workspaceId to service', async () => {
      const score = { score: 85, level: 'hot' as const, factors: { recency: 20, frequency: 25, responseRate: 15, purchaseValue: 25 } };
      calculateEngagementScore.mockResolvedValue(score);

      const result = await controller.getContactScore('ws-1', 'c-1');

      expect(calculateEngagementScore).toHaveBeenCalledWith('c-1', 'ws-1');
      expect(result).toEqual(score);
    });
  });

  describe('autoSegment', () => {
    it('propagates error when service rejects', async () => {
      const error = new Error('Database connection failed');
      autoSegmentWorkspace.mockRejectedValue(error);

      await expect(controller.autoSegment('ws-1')).rejects.toThrow('Database connection failed');

      expect(autoSegmentWorkspace).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('getPresetSegment', () => {
    it('passes workspaceId from param to service with no overrides when limit omitted', async () => {
      getPresetSegment.mockResolvedValue({ contacts: [], total: 0, criteria: {} });

      await controller.getPresetSegment('ws-abc', 'HOT_LEADS');

      expect(getPresetSegment).toHaveBeenCalledWith('ws-abc', 'HOT_LEADS', {});
    });

    it('parses limit query and clamps into override', async () => {
      getPresetSegment.mockResolvedValue({ contacts: [], total: 0, criteria: {} });

      await controller.getPresetSegment('ws-1', 'COLD_LEADS', '150');

      expect(getPresetSegment).toHaveBeenCalledWith('ws-1', 'COLD_LEADS', { limit: 100 });
    });
  });
});

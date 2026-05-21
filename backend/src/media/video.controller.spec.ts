import { VideoController } from './video.controller';

describe('VideoController', () => {
  const describeCapabilities = jest.fn();

  let controller: VideoController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new VideoController({ describeCapabilities } as never);
  });

  describe('ping', () => {
    it('delegates to videoService.describeCapabilities and returns its result', () => {
      const contract = {
        status: 'available' as const,
        jobType: 'VIDEO_GENERATION' as const,
        createEndpoint: '/media/video',
        statusEndpoint: '/media/job/:id',
        backingStore: 'MediaJob',
        queue: 'media-jobs',
      };
      describeCapabilities.mockReturnValue(contract);

      const result = controller.ping();

      expect(describeCapabilities).toHaveBeenCalledTimes(1);
      expect(describeCapabilities).toHaveBeenCalledWith();
      expect(result).toBe(contract);
    });

    it('propagates errors thrown by describeCapabilities', () => {
      const error = new Error('video service unavailable');
      describeCapabilities.mockImplementation(() => {
        throw error;
      });

      expect(() => controller.ping()).toThrow(error);
    });

    it('returns a contract with all required capability fields', () => {
      describeCapabilities.mockReturnValue({
        status: 'available',
        jobType: 'VIDEO_GENERATION',
        createEndpoint: '/media/video',
        statusEndpoint: '/media/job/:id',
        backingStore: 'MediaJob',
        queue: 'media-jobs',
      });

      const result = controller.ping();

      expect(result).toEqual({
        status: 'available',
        jobType: 'VIDEO_GENERATION',
        createEndpoint: '/media/video',
        statusEndpoint: '/media/job/:id',
        backingStore: 'MediaJob',
        queue: 'media-jobs',
      });
    });

    it('works without request or auth context', () => {
      describeCapabilities.mockReturnValue({
        status: 'available',
        jobType: 'VIDEO_GENERATION',
        createEndpoint: '/media/video',
        statusEndpoint: '/media/job/:id',
        backingStore: 'MediaJob',
        queue: 'media-jobs',
      });

      const result = controller.ping();

      expect(result.status).toBe('available');
      expect(describeCapabilities).toHaveBeenCalledTimes(1);
    });
  });
});

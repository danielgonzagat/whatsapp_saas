import { VideoService } from './video.service';

describe('VideoService', () => {
  it('describes the real media video job contract', () => {
    expect(new VideoService().describeCapabilities()).toEqual({
      status: 'available',
      jobType: 'VIDEO_GENERATION',
      createEndpoint: '/media/video',
      statusEndpoint: '/media/job/:id',
      backingStore: 'MediaJob',
      queue: 'media-jobs',
    });
  });
});

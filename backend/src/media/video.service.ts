import { Injectable, Logger } from '@nestjs/common';

export interface MediaVideoCapabilities {
  status: 'available';
  jobType: 'VIDEO_GENERATION';
  createEndpoint: '/media/video';
  statusEndpoint: '/media/job/:id';
  backingStore: 'MediaJob';
  queue: 'media-jobs';
}

/** Video service. */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  describeCapabilities(): MediaVideoCapabilities {
    this.logger.log('Media video capability contract requested');
    return {
      status: 'available',
      jobType: 'VIDEO_GENERATION',
      createEndpoint: '/media/video',
      statusEndpoint: '/media/job/:id',
      backingStore: 'MediaJob',
      queue: 'media-jobs',
    };
  }
}

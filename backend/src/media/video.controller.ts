import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { VideoService } from './video.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Video controller. */
@Controller('media/video')
@RouteClass('mutate')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  /** Ping. */
  @Public()
  @Get('ping')
  ping() {
    return this.videoService.describeCapabilities();
  }
}

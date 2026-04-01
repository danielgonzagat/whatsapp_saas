import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { VideoService } from './video.service';

@Controller('media/video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Public()
  @Get('ping')
  ping() {
    return this.videoService.generate();
  }
}

import { Controller, Get } from '@nestjs/common';
import { VideoService } from './video.service';

@Controller('media/video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get('ping')
  ping() {
    return this.videoService.generate();
  }
}

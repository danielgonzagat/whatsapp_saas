import { Injectable, Logger } from '@nestjs/common';

/** Video service. */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  // Placeholder para futura implementação (AI Video Studio)
  generate() {
    this.logger.log('VideoService initialized');
    return { ok: true };
  }
}

import { Module } from '@nestjs/common';
import { TranscriptionService } from './transcription.service';

/** Audio module. */
@Module({
  providers: [TranscriptionService],
  exports: [TranscriptionService],
})
export class AudioModule {}

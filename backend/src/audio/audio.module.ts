import { Module } from '@nestjs/common';
import { TranscriptionService } from './transcription.service';
import { AudioController } from './audio.controller';

@Module({
  controllers: [AudioController],
  providers: [TranscriptionService],
  exports: [TranscriptionService],
})
export class AudioModule {}

import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { TranscriptionService } from './transcription.service';

@Module({
  controllers: [AudioController],
  providers: [TranscriptionService],
  exports: [TranscriptionService],
})
export class AudioModule {}

import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { TranscriptionService } from './transcription.service';

/** Audio module. */
@Module({
  controllers: [AudioController],
  providers: [TranscriptionService],
  exports: [TranscriptionService],
})
/**
 * @cluster whatsapp_saas/backend/audio
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AudioModule {}

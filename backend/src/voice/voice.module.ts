import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

/** Voice module. */
@Module({
  imports: [PrismaModule],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}

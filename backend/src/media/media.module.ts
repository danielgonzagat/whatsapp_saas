import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
  imports: [PrismaModule],
  controllers: [VideoController, MediaController],
  providers: [VideoService, MediaService],
})
export class MediaModule {}

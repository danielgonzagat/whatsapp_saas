import { Module } from '@nestjs/common';
import { FollowUpService } from './followup.service';
import { FollowUpController } from './followup.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FollowUpController],
  providers: [FollowUpService],
  exports: [FollowUpService],
})
export class FollowUpModule {}

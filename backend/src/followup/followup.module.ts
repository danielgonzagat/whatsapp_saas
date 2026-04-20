import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FollowUpController } from './followup.controller';
import { FollowUpService } from './followup.service';

/** Follow up module. */
@Module({
  imports: [PrismaModule],
  controllers: [FollowUpController],
  providers: [FollowUpService],
  exports: [FollowUpService],
})
export class FollowUpModule {}

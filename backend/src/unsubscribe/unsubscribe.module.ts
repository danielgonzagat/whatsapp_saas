import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';

@Module({
  imports: [PrismaModule],
  controllers: [UnsubscribeController],
  providers: [UnsubscribeService],
  exports: [UnsubscribeService],
})
export class UnsubscribeModule {}

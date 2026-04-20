import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LaunchController } from './launch.controller';
import { LaunchService } from './launch.service';

/** Launch module. */
@Module({
  imports: [PrismaModule],
  controllers: [LaunchController],
  providers: [LaunchService],
  exports: [LaunchService],
})
export class LaunchModule {}

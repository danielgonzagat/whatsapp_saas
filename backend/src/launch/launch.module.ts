import { Module } from '@nestjs/common';
import { LaunchService } from './launch.service';
import { LaunchController } from './launch.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LaunchController],
  providers: [LaunchService],
  exports: [LaunchService],
})
export class LaunchModule {}

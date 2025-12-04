import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '@nestjs-modules/ioredis';

@Module({
  imports: [
    PrismaModule,
    RedisModule.forRoot({
      type: 'single',
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    }),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

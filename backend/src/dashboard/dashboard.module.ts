import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '@nestjs-modules/ioredis';
import { getRedisUrl } from '../common/redis/redis.util';

@Module({
  imports: [
    PrismaModule,
    RedisModule.forRoot({
      type: 'single',
      url: getRedisUrl(),
    }),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

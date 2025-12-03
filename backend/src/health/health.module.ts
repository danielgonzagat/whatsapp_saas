import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '@nestjs-modules/ioredis';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  controllers: [HealthController, SystemHealthController],
  providers: [HealthService, SystemHealthService],
})
export class HealthModule {}

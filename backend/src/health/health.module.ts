import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { MetricsModule } from '../metrics/metrics.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { BullMQHealthIndicator } from './indicators/bullmq.health-indicator';
import { PrismaHealthIndicator } from './indicators/prisma.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';

// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL
// NÃO reimportar aqui sem .forRoot() - isso causa conexão localhost:6379!

@Module({
  imports: [PrismaModule, ConfigModule, WhatsappModule, MetricsModule, TerminusModule],
  controllers: [SystemHealthController, HealthController],
  providers: [
    HealthService,
    SystemHealthService,
    PrismaHealthIndicator,
    RedisHealthIndicator,
    BullMQHealthIndicator,
  ],
  exports: [SystemHealthService],
})
export class HealthModule {}

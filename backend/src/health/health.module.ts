import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetricsModule } from '../metrics/metrics.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';

// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL
// NÃO reimportar aqui sem .forRoot() - isso causa conexão localhost:6379!

@Module({
  imports: [PrismaModule, ConfigModule, WhatsappModule, MetricsModule],
  controllers: [SystemHealthController, HealthController],
  providers: [HealthService, SystemHealthService],
  exports: [SystemHealthService],
})
export class HealthModule {}

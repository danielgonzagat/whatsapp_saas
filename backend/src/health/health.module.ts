import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';
import { ConfigModule } from '@nestjs/config';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL
// NÃO reimportar aqui sem .forRoot() - isso causa conexão localhost:6379!

@Module({
  imports: [PrismaModule, ConfigModule, WhatsappModule],
  controllers: [SystemHealthController, HealthController],
  providers: [HealthService, SystemHealthService],
  exports: [HealthService, SystemHealthService],
})
export class HealthModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL
// NÃO chamar forRoot() novamente - usa a conexão global

@Module({
  imports: [
    PrismaModule,
    // RedisModule - REMOVIDO: já configurado globalmente
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
/**
 * @cluster whatsapp_saas/backend/dashboard
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class DashboardModule {}

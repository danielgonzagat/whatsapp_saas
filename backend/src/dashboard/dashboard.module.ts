import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL
// NÃO chamar forRoot() novamente - usa a conexão global

@Module({
  imports: [
    PrismaModule,
    // RedisModule - REMOVIDO: já configurado no AppModule
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

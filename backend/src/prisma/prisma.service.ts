import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  // Omit constructor or use minimal one
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error: any) {
      // Não derrubar o processo: endpoints lidarão com falhas de DB e retornarão 503.
      this.logger.error(
        'Falha ao conectar no banco durante startup. O serviço continuará iniciando.',
        typeof error?.stack === 'string' ? error.stack : undefined,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Prisma service. */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(PrismaService.name);

  // Omit constructor or use minimal one
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error: unknown) {
      // Não derrubar o processo: endpoints lidarão com falhas de DB e retornarão 503.
      this.logger.error(
        'Falha ao conectar no banco durante startup. O serviço continuará iniciando.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** On module destroy. */
  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Before application shutdown. */
  async beforeApplicationShutdown(signal?: string) {
    try {
      this.logger.log(`Encerrando conexões Prisma antes do shutdown (${signal || 'unknown'}).`);
      await this.$disconnect();
    } catch (error: unknown) {
      this.logger.warn(
        `Falha ao encerrar Prisma no shutdown: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
    }
  }
}

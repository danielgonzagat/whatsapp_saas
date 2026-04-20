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
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      // Não derrubar o processo: endpoints lidarão com falhas de DB e retornarão 503.
      this.logger.error(
        'Falha ao conectar no banco durante startup. O serviço continuará iniciando.',
        typeof errorInstanceofError?.stack === 'string' ? errorInstanceofError.stack : undefined,
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
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(`Falha ao encerrar Prisma no shutdown: ${errorInstanceofError.message}`);
    }
  }
}

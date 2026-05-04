import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Unified handling for Prisma database initialization and connectivity errors.
 * Translates low-level Prisma errors into user-friendly HTTP 503 responses.
 *
 * Covers:
 * - P2021, P2022: Schema/migration mismatch
 * - P1001, P1002: Connectivity issues
 * - PrismaClientInitializationError: Connection pool exhaustion or startup errors
 */
export class DbInitErrorService {
  /** Throw friendly db init error. */
  static throwFriendlyDbInitError(error: unknown): never {
    const message = error instanceof Error ? error.message : '';

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      // P2021: table does not exist | P2022: column does not exist
      // Ambos indicam schema/migrations fora de sincronia.
      throw new ServiceUnavailableException(
        'Serviço indisponível. Banco de dados ainda não inicializado (migrations não aplicadas).',
      );
    }

    // Casos comuns quando o schema ainda não existe / migrations não aplicadas.
    if (message.toLowerCase().includes('database not initialized')) {
      throw new ServiceUnavailableException(
        'Serviço indisponível. Banco de dados ainda não inicializado (migrations não aplicadas).',
      );
    }

    // Erros de conectividade (ex.: banco fora do ar)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P1001' || error.code === 'P1002')
    ) {
      throw new ServiceUnavailableException(
        'Serviço indisponível. Não foi possível conectar ao banco de dados.',
      );
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw new ServiceUnavailableException(
        'Serviço indisponível. Não foi possível conectar ao banco de dados.',
      );
    }

    throw error;
  }
}

/**
 * @capability PrismaClientSingleton
 * @domain prisma
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { buildPrismaClientOptions } from './utils/prisma-datasource-url';

const enableQueryLogs = process.env.PRISMA_QUERY_LOGS === 'true';

/** Prisma. */
export const prisma = new PrismaClient({
  // Canonical pool bounds (connection_limit/pool_timeout) applied in ONE place
  // for the worker runtime — see utils/prisma-datasource-url.ts (issue #413).
  ...buildPrismaClientOptions(process.env),
  log: enableQueryLogs ? [{ emit: 'event', level: 'query' }, 'warn', 'error'] : ['warn', 'error'],
});

if (enableQueryLogs) {
  prisma.$on('query', (event: Prisma.QueryEvent) => {
    if (event.duration > 1000) {
      console.warn(`[PRISMA] slow query ${event.duration}ms: ${event.query.slice(0, 240)}`);
    }
  });
}

let shuttingDown = false;

async function shutdownPrisma(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    console.log(`[PRISMA] disconnecting on ${signal}...`);
    await prisma.$disconnect();
  } catch (error: unknown) {
    console.warn('[PRISMA] disconnect failed', {
      signal,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

process.once('SIGTERM', () => {
  void shutdownPrisma('SIGTERM');
});

process.once('SIGINT', () => {
  void shutdownPrisma('SIGINT');
});

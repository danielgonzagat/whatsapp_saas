import { Prisma, PrismaClient } from '@prisma/client';

const enableQueryLogs = process.env.PRISMA_QUERY_LOGS === 'true';

/** Prisma. */
export const prisma = new PrismaClient({
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

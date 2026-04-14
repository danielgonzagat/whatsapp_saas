import { PrismaClient } from '@prisma/client';

const enableQueryLogs = process.env.PRISMA_QUERY_LOGS === 'true';

export const prisma = new PrismaClient({
  log: enableQueryLogs ? [{ emit: 'event', level: 'query' }, 'warn', 'error'] : ['warn', 'error'],
});

if (enableQueryLogs) {
  prisma.$on('query', (event: any) => {
    if (event?.duration > 1000) {
      console.warn(`[PRISMA] slow query ${event.duration}ms: ${event.query?.slice(0, 240)}`);
    }
  });
}

let shuttingDown = false;

async function shutdownPrisma(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    console.log(`[PRISMA] disconnecting on ${signal}...`);
    await prisma.$disconnect();
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    console.warn(
      `[PRISMA] disconnect failed during ${signal}:`,
      errorInstanceofError?.message || error,
    );
  }
}

process.once('SIGTERM', () => {
  void shutdownPrisma('SIGTERM');
});

process.once('SIGINT', () => {
  void shutdownPrisma('SIGINT');
});

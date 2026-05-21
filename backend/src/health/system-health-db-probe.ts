import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { connection } from '../queue/queue';

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function probePostgres(prisma: PrismaService): Promise<{
  dependency: string;
  status: 'UP' | 'DOWN';
  error?: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  try {
    await withTimeout(prisma.$queryRaw<{ '?column?': 1 }[]>`SELECT 1`, 2_000, 'postgres');
    return { dependency: 'postgres', status: 'UP', latencyMs: Date.now() - startedAt };
  } catch (err: unknown) {
    return {
      dependency: 'postgres',
      status: 'DOWN',
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function probeBullMQRedis(): Promise<{
  dependency: string;
  status: 'UP' | 'DOWN';
  error?: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  try {
    await withTimeout(connection.ping(), 2_000, 'redis-bullmq');
    return { dependency: 'redis', status: 'UP', latencyMs: Date.now() - startedAt };
  } catch (err: unknown) {
    return {
      dependency: 'redis',
      status: 'DOWN',
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function checkDatabase(prisma: PrismaService) {
  try {
    await prisma.$queryRaw<{ '?column?': 1 }[]>`SELECT 1`;
    return { status: 'UP', latency: 'OK' };
  } catch (e: unknown) {
    return { status: 'DOWN', error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkRedis(redis: Redis) {
  try {
    await redis.ping();
    return { status: 'UP' };
  } catch (e: unknown) {
    return {
      status: 'DOWN',
      error: e instanceof Error ? (e instanceof Error ? e.message : String(e)) : 'unknown_error',
    };
  }
}

/**
 * PULSE Parser 81: Chaos — Dependency Failure (STATIC)
 * Layer 13: Chaos Engineering
 *
 * STATIC analysis: checks that resilience patterns exist in code.
 * No live infrastructure required.
 *
 * BREAK TYPES:
 *   CHAOS_REDIS_CRASH (high)    — no redis.on('error') handler found
 *   CHAOS_DB_CRASH (high)       — no Prisma error handling found
 *   CHAOS_JOB_LOST (high)       — no job retry configuration found in worker
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function readSafe(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

export function checkChaosDependencyFailure(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ── CHECK 1: Redis error handling ───────────────────────────────────────────
  // Look for redis.on('error', ...) or try/catch around redis operations
  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(
    f => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f),
  );
  const workerFiles = walkFiles(config.workerDir, ['.ts']).filter(
    f => !/\.(spec|test)\.ts$|__tests__|__mocks__/.test(f),
  );
  const allFiles = [...backendFiles, ...workerFiles];

  const redisFiles = allFiles.filter(f => {
    const content = readSafe(f);
    return /redis|ioredis|bullmq|createClient/i.test(content);
  });

  const hasRedisErrorHandler = redisFiles.some(f => {
    const content = readSafe(f);
    // Check for event-based error handling: .on('error', ...) or .on("error", ...)
    return (
      /\.on\s*\(\s*['"]error['"]\s*,/.test(content) ||
      // Or try/catch wrapping redis operations
      /try\s*\{[\s\S]{0,500}redis[\s\S]{0,200}\}\s*catch/.test(content)
    );
  });

  if (redisFiles.length > 0 && !hasRedisErrorHandler) {
    breaks.push({
      type: 'CHAOS_REDIS_CRASH',
      severity: 'high',
      file: path.relative(config.rootDir, redisFiles[0]),
      line: 1,
      description: 'No Redis error handler found — application may crash when Redis becomes unavailable',
      detail:
        'Add .on("error", handler) to Redis client instances, or wrap redis operations in try/catch. ' +
        'Without this, an unhandled "error" event will crash the Node.js process.',
    });
  }

  // ── CHECK 2: Prisma/DB reconnection/error handling ───────────────────────────
  // Look for PrismaClientInitializationError handling or $connect retry logic
  const hasPrismaErrorHandling = backendFiles.some(f => {
    const content = readSafe(f);
    return (
      /PrismaClientInitializationError|PrismaClientKnownRequestError|PrismaClientUnknownRequestError/.test(content) ||
      /prisma\.\$connect\s*\(/.test(content) ||
      /retryConnect|reconnect.*prisma|prisma.*reconnect/i.test(content)
    );
  });

  if (!hasPrismaErrorHandling) {
    breaks.push({
      type: 'CHAOS_DB_CRASH',
      severity: 'high',
      file: path.relative(config.rootDir, config.backendDir),
      line: 1,
      description: 'No Prisma error handling or reconnection logic found',
      detail:
        'Catch PrismaClientInitializationError in service layer and return 503. ' +
        'Consider adding prisma.$connect() retry logic on startup.',
    });
  }

  // ── CHECK 3: BullMQ job retry configuration ──────────────────────────────────
  // Check backend queue configuration for retry/attempts settings
  const queueFiles = [...backendFiles, ...workerFiles].filter(f => {
    const content = readSafe(f);
    return /new\s+Queue\s*\(|new\s+Worker\s*\(|defaultJobOptions/i.test(content);
  });

  const hasJobRetry = queueFiles.some(f => {
    const content = readSafe(f);
    return /attempts\s*:|backoff\s*:|removeOnFail\s*:|defaultJobOptions/i.test(content);
  });

  if (queueFiles.length > 0 && !hasJobRetry) {
    breaks.push({
      type: 'CHAOS_JOB_LOST',
      severity: 'high',
      file: path.relative(config.rootDir, queueFiles[0]),
      line: 1,
      description: 'BullMQ queues found but no retry/attempts configuration detected',
      detail:
        'Add defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } } ' +
        'to Queue constructor options to prevent job loss on worker crash.',
    });
  }

  return breaks;
}

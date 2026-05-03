import * as path from 'path';
import { pathExists, readTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';

export interface RawWorkerDiscovery {
  file: string;
  line: number;
  queueName: string;
  handlerName: string;
}

/** Detect BullMQ workers created via `new Worker('queue-name', ...)` inside backend files. */
export function rawWorkerDiscoveries(workerDir: string): RawWorkerDiscovery[] {
  const discoveries: RawWorkerDiscovery[] = [];

  if (!pathExists(workerDir)) {
    return discoveries;
  }

  const files = walkFiles(workerDir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const workerRe =
      /new\s+Worker\s*\(\s*(?:['"`]([^'"`]+)['"`])\s*,\s*(?:async\s+)?(?:\([^)]*\)|function\s*\w*|[A-Za-z_]\w*)/g;
    let match: RegExpExecArray | null;
    const lines = content.split('\n');

    while ((match = workerRe.exec(content)) !== null) {
      const queueName = match[1];
      const precedingSlice = content.slice(0, match.index);
      const line = (precedingSlice.match(/\n/g) || []).length + 1;

      // Look up the wrapping function/class name
      let handlerName = `${queueName}-worker`;
      // Try to find a nearby export function or class
      const nearbyRe =
        /(?:export\s+(?:async\s+)?function\s+|export\s+class\s+|class\s+)([A-Za-z_]\w*)/g;
      let nearbyMatch: RegExpExecArray | null;
      while ((nearbyMatch = nearbyRe.exec(precedingSlice)) !== null) {
        handlerName = nearbyMatch[1];
      }

      discoveries.push({
        file: path.relative(workerDir, file),
        line,
        queueName,
        handlerName,
      });
    }
  }

  return discoveries;
}

/** Detect workers via `@Processor('queue-name')` and `@Process('job-name')` decorators. */
export function nestjsBullMQDiscoveries(dir: string): RawWorkerDiscovery[] {
  const discoveries: RawWorkerDiscovery[] = [];

  if (!pathExists(dir)) {
    return discoveries;
  }

  const files = walkFiles(dir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const processorRe = /@Processor\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    let processorMatch: RegExpExecArray | null;
    while ((processorMatch = processorRe.exec(content)) !== null) {
      const queueName = processorMatch[1] || 'unknown-queue';
      const processRe = /@Process\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
      let processMatch: RegExpExecArray | null;
      while ((processMatch = processRe.exec(content)) !== null) {
        const jobName = processMatch[1] || 'unknown-job';
        const precedingSlice = content.slice(0, processMatch.index);
        const line = (precedingSlice.match(/\n/g) || []).length + 1;

        discoveries.push({
          file: path.relative(dir, file),
          line,
          queueName,
          handlerName: jobName,
        });
      }
    }
  }

  return discoveries;
}

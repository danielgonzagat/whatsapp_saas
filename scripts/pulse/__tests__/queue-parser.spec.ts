import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkQueues } from '../parsers/queue-parser';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-queue-parser-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('queue parser dynamic evidence', () => {
  it('matches queue producers and processors through TypeScript structure', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/queue-producer.ts',
      `
      import { Queue } from 'bullmq';

      const mediaQueue = new Queue(
        'media-work',
      );

      export async function enqueue() {
        await mediaQueue.add(
          'resize-image',
          { assetId: 'asset-1' },
        );
      }
      `,
    );
    writeFile(
      config.rootDir,
      'worker/media-worker.ts',
      `
      import { Worker } from 'bullmq';

      new Worker(
        'media-work',
        async (job) => {
          if (job.name === 'resize-image') {
            return job.data;
          }
          return undefined;
        },
      );
      `,
    );

    expect(checkQueues(config)).toEqual([]);
  });

  it('treats generic workers for a discovered queue as processor evidence', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/generic-producer.ts',
      `
      import { Queue } from 'bullmq';

      const billingQueue = new Queue('billing-work');

      export async function enqueue() {
        await billingQueue.add('invoice-created', {});
      }
      `,
    );
    writeFile(
      config.rootDir,
      'worker/generic-worker.ts',
      `
      import { Worker } from 'bullmq';

      new Worker('billing-work', async (job) => job.data);
      `,
    );

    expect(checkQueues(config)).toEqual([]);
  });

  it('reports unmatched producers and processors without regex-backed decision rules', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/unmatched-producer.ts',
      `
      export class Producer {
        constructor(private readonly queue: { add(name: string, data: unknown): Promise<void> }) {}
        enqueue() {
          return this.queue.add('orphan-job', {});
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'worker/orphan-processor.ts',
      `
      export function process(job: { name: string }) {
        switch (job.name) {
          case 'orphan-processor':
            return true;
          default:
            return false;
        }
      }
      `,
    );

    expect(checkQueues(config)).toEqual([
      expect.objectContaining({
        type: 'QUEUE_NO_PROCESSOR',
        file: 'backend/src/unmatched-producer.ts',
      }),
      expect.objectContaining({
        type: 'PROCESSOR_NO_PRODUCER',
        file: 'worker/orphan-processor.ts',
      }),
    ]);
  });

  it('keeps queue parser free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const queueParserFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/queue-parser.ts',
    );

    expect(queueParserFindings).toEqual([]);
  });
});

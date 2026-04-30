import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { checkWorkerResilience } from '../parsers/worker-resilience-checker';
import type { PulseConfig } from '../types';

function makeConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend', 'src'),
    backendDir: path.join(rootDir, 'backend', 'src'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend', 'prisma', 'schema.prisma'),
    globalPrefix: '',
  };
}

describe('worker resilience checker diagnostics', () => {
  it('routes worker resilience findings through synthesized diagnostics', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-worker-resilience-'));
    const workerSrcDir = path.join(rootDir, 'worker', 'src');
    fs.mkdirSync(workerSrcDir, { recursive: true });
    fs.writeFileSync(
      path.join(workerSrcDir, 'jobs.ts'),
      [
        'export async function run(browser: { newPage(): Promise<{ goto(url: string): Promise<void> }> }, emailQueue: { add(name: string, data: object): Promise<void> }) {',
        '  const page = await browser.newPage();',
        "  await page.goto('https://example.test');",
        "  await emailQueue.add('send-email', {});",
        '}',
      ].join('\n'),
    );

    try {
      const findings = checkWorkerResilience(makeConfig(rootDir));

      expect(findings).toHaveLength(3);
      expect(findings.every((finding) => finding.type.startsWith('diagnostic:'))).toBe(true);
      expect(findings.map((finding) => finding.type)).not.toEqual(
        expect.arrayContaining(['PUPPETEER_PAGE_LEAK', 'PUPPETEER_NO_TIMEOUT', 'JOB_NO_RETRY']),
      );
      expect(findings.map((finding) => finding.surface)).toEqual(
        expect.arrayContaining([
          'worker-puppeteer-page-lifecycle',
          'worker-puppeteer-timeout',
          'worker-bullmq-retry-policy',
        ]),
      );
      expect(findings.every((finding) => finding.detail.includes('predicates='))).toBe(true);
      expect(findings.map((finding) => finding.source)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('detector=puppeteer-page-lifecycle-evidence'),
          expect.stringContaining('detector=puppeteer-timeout-evidence'),
          expect.stringContaining('detector=bullmq-retry-policy-evidence'),
        ]),
      );
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps confirmed retry and timeout evidence out of diagnostics', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-worker-resilience-'));
    const workerDir = path.join(rootDir, 'worker');
    const workerSrcDir = path.join(workerDir, 'src');
    fs.mkdirSync(workerSrcDir, { recursive: true });
    fs.writeFileSync(
      path.join(workerDir, 'queue.ts'),
      'export const queueConfig = { defaultJobOptions: { attempts: 3 } };',
    );
    fs.writeFileSync(
      path.join(workerSrcDir, 'jobs.ts'),
      [
        'export async function run(page: { goto(url: string, options: { timeout: number }): Promise<void>; close(): Promise<void> }, emailQueue: { add(name: string, data: object): Promise<void> }) {',
        "  await page.goto('https://example.test', { timeout: 5000 });",
        "  await emailQueue.add('send-email', {});",
        '  await page.close();',
        '}',
      ].join('\n'),
    );

    try {
      expect(checkWorkerResilience(makeConfig(rootDir))).toEqual([]);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

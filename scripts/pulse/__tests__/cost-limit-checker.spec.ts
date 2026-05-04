import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkCostLimits } from '../parsers/cost-limit-checker';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cost-limit-checker-'));
  const backendDir = path.join(rootDir, 'backend/src');
  const frontendDir = path.join(rootDir, 'frontend/src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend/prisma/schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  tempRoots.push(rootDir);

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeBackendFile(config: PulseConfig, relativePath: string, content: string): void {
  const file = path.join(config.backendDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('cost limit checker parser', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('emits synthesized diagnostics from cost-control predicates', () => {
    const config = makeConfig();

    writeBackendFile(
      config,
      'agent.service.ts',
      `
      export class AgentService {
        async reply() {
          return this.openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [] });
        }
      }
      `,
    );

    const breaks = checkCostLimits(config);

    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks.every((item) => item.type.startsWith('diagnostic:cost-limit-checker:'))).toBe(
      true,
    );
    expect(breaks.every((item) => item.type !== 'cost-control-evidence-gap')).toBe(true);
    expect(breaks.every((item) => item.source?.includes('predicates='))).toBe(true);
    expect(breaks.every((item) => item.source?.includes('truthMode=weak_signal'))).toBe(true);
    expect(breaks.every((item) => item.detail.includes('evidence='))).toBe(true);
  });
});

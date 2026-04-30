import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkAntiHardcode } from '../parsers/anti-hardcode-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-anti-hardcode-'));
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
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('anti-hardcode checker', () => {
  it('emits confirmed diagnostics from source evidence and predicate grammar', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'frontend/src/assistant-status.tsx',
      "export const status = 'Redigindo a resposta para voce';",
    );

    const diagnostics = checkAntiHardcode(config);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        type: 'AI_PSEUDO_THINKING_HARDCODED',
        severity: 'critical',
        file: 'frontend/src/assistant-status.tsx',
        line: 1,
        source: expect.stringContaining('truthMode=confirmed_static'),
      }),
    ]);
    expect(diagnostics[0].source).toContain('pseudo_cognition_grammar_matched');
    expect(diagnostics[0].detail).toContain('source string literal matched kernel');
  });

  it('keeps test fixtures outside product diagnostics', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'frontend/src/__tests__/assistant-status.spec.ts',
      "expect(screen.getByText('Redigindo a resposta')).toBeVisible();",
    );

    expect(checkAntiHardcode(config)).toEqual([]);
  });
});

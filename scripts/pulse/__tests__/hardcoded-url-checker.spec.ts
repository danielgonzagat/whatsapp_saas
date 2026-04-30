import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkHardcodedUrls } from '../parsers/hardcoded-url-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hardcoded-url-'));
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

describe('hardcoded URL checker', () => {
  it('does not retain static domain truth tables in the checker source', () => {
    const checkerSource = fs.readFileSync(
      path.join(__dirname, '../parsers/hardcoded-url-checker.ts'),
      'utf8',
    );

    expect(checkerSource).not.toMatch(/ALLOWED_EXTERNAL_DOMAINS|PROD_DOMAIN_RE|INTERNAL_DOMAIN_RE/);
    expect(checkerSource).not.toMatch(/kloel\.com|api\.kloel\.com/);
  });

  it('treats brand-looking URL literals as weak evidence until runtime/config confirms them', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/client.ts',
      "const endpoint = 'https://api.customer-domain.invalid/health';",
    );

    const breaks = checkHardcodedUrls(config);

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'HARDCODED_URL_WEAK_EVIDENCE',
        severity: 'low',
        source: 'regex-weak-signal:hardcoded-url-checker:needs_probe',
      }),
    ]);
    expect(breaks[0].description).not.toMatch(/production|internal|infrastructure/i);
    expect(breaks[0].detail).toContain('Evidence source: unconfirmed');
  });

  it('confirms URL literals only from discovered config evidence', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/provider/provider.config.ts',
      "export const providerBaseUrl = 'https://configured.example.test/api';",
    );
    writeFile(
      config.rootDir,
      'backend/src/client.ts',
      "const endpoint = 'https://configured.example.test/api/events';",
    );

    const breaks = checkHardcodedUrls(config);

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'HARDCODED_CONFIRMED_URL',
        severity: 'low',
        source: 'regex-confirmed-signal:hardcoded-url-checker',
      }),
    ]);
    expect(breaks[0].detail).toContain('Evidence source: config');
  });

  it('uses runtime artifacts as domain evidence without static domain allowlists', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      '.pulse/current/PULSE_RUNTIME_EVIDENCE.json',
      JSON.stringify({
        probes: [{ target: 'https://runtime-observed.example.test/status' }],
      }),
    );
    writeFile(
      config.rootDir,
      'backend/src/client.ts',
      "const endpoint = 'https://runtime-observed.example.test/status';",
    );

    const breaks = checkHardcodedUrls(config);

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'HARDCODED_CONFIRMED_URL',
        source: 'regex-confirmed-signal:hardcoded-url-checker',
      }),
    ]);
    expect(breaks[0].detail).toContain('Evidence source: runtime_artifact');
  });
});

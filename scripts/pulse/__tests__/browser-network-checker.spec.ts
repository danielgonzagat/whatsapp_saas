import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkBrowserNetwork } from '../parsers/browser-network-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-browser-network-'));
  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');
  const workerDir = path.join(rootDir, 'worker');

  fs.mkdirSync(path.join(backendDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(frontendDir, 'src'), { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });

  return {
    rootDir,
    backendDir,
    frontendDir,
    workerDir,
    schemaPath: path.join(rootDir, 'schema.prisma'),
    globalPrefix: '',
  };
}

function writeFrontendFile(config: PulseConfig, relativePath: string, content: string): void {
  const file = path.join(config.frontendDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('checkBrowserNetwork', () => {
  it('has no hardcoded reality audit findings in the browser network checker', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const browserNetworkFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/browser-network-checker.ts',
    );

    expect(browserNetworkFindings).toEqual([]);
  });

  it('keeps browser network evidence derived from scanned source content', () => {
    const config = makeConfig();
    writeFrontendFile(
      config,
      'src/app/billing/page.tsx',
      `
      export function BillingPage() {
        useEffect(() => { fetch('/api/billing'); }, []);
        return <form><input name="amountCents" /></form>;
      }
      `,
    );

    const findings = checkBrowserNetwork(config);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'browser-network-evidence-gap',
          description:
            'Page fetches async data but has no loading state — blank/broken UI on slow network',
        }),
        expect.objectContaining({
          type: 'browser-network-evidence-gap',
          description:
            'Money-like form has no offline protection — user loses entered data on connection drop',
        }),
      ]),
    );
  });
});

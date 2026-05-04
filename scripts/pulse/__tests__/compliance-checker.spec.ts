import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkCompliance } from '../parsers/compliance-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-compliance-'));
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

describe('compliance checker dynamic evidence', () => {
  it('recognizes compliance evidence from discovered routes, handlers, and consent text', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'frontend/src/app/privacy/page.tsx',
      'export default function Page() {}',
    );
    writeFile(
      config.rootDir,
      'frontend/src/app/terms/page.tsx',
      'export default function Page() {}',
    );
    writeFile(
      config.rootDir,
      'frontend/src/components/preferences.tsx',
      'export function PreferenceCenter() { return <label>Cookies consentimento</label>; }',
    );
    writeFile(
      config.rootDir,
      'frontend/src/app/checkout/page.tsx',
      'export default function Checkout() { return <label>aceito os termos e privacidade</label>; }',
    );
    writeFile(
      config.rootDir,
      'backend/src/account.controller.ts',
      `
      import { Delete, Get, Post } from '@nestjs/common';
      export class AccountController {
        @Get('account/export') exportData() { return {}; }
        @Delete('account') deleteAccount() { return {}; }
        @Post('account/delete') anonymize() { return {}; }
      }
      `,
    );
    writeFile(config.rootDir, '.data-retention.json', '{"records":"180d"}');

    expect(checkCompliance(config)).toEqual([]);
  });

  it('keeps compliance checker free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const complianceFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/compliance-checker.ts',
    );

    expect(complianceFindings).toEqual([]);
  });
});

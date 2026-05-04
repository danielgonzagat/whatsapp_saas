import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkInjection } from '../parsers/injection-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-injection-checker-'));
  const frontendDir = path.join(rootDir, 'frontend');
  const backendDir = path.join(rootDir, 'backend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, frontendDir, backendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('injection checker structural evidence', () => {
  it('keeps injection checker free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/injection-checker.ts',
    );

    expect(findings).toEqual([]);
  });

  it('detects injection sinks from AST nodes without flagging comments or literal imports', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/injection-sample.tsx',
      [
        'const literalModule = require("safe-module");',
        'const safeHtml = { __html: sanitize(content) };',
        'const unsafeHtml = { __html: content };',
        'const moduleName = getModuleName();',
        'require(moduleName);',
        'new Function(userInput);',
        'eval(userInput);',
        'export function View() {',
        '  return <main dangerouslySetInnerHTML={unsafeHtml} />;',
        '}',
        '// eval(commentOnly)',
      ].join('\n'),
    );

    const breaks = checkInjection(config);

    expect(breaks.map((entry) => entry.type)).toEqual([
      'DYNAMIC_REQUIRE_RISK',
      'EVAL_USAGE',
      'EVAL_USAGE',
      'XSS_DANGEROUS_HTML',
    ]);
    expect(breaks.map((entry) => entry.line)).toEqual([5, 6, 7, 9]);
  });
});

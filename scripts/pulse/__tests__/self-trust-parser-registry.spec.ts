import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkParserRegistry } from '../self-trust';

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-self-trust-'));
}

function writeParser(rootDir: string, name: string, source: string): void {
  const target = path.join(rootDir, 'scripts', 'pulse', 'parsers', `${name}.ts`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source, 'utf8');
}

const criticalParserNames = [
  'financial-arithmetic',
  'error-handler-auditor',
  'idempotency-checker',
  'audit-trail-checker',
  'security-injection',
] as const;

describe('checkParserRegistry critical parser contracts', () => {
  it('fails when a critical parser file is missing from the active contract set', () => {
    const rootDir = makeRoot();
    criticalParserNames
      .filter((name) => name !== 'security-injection')
      .forEach((name, index) => {
        writeParser(rootDir, name, `export function checkCritical${index}() { return []; }`);
      });

    const result = checkParserRegistry(path.join(rootDir, 'scripts', 'pulse', 'parsers'));

    expect(result.pass).toBe(false);
    expect(result.severity).toBe('critical');
    expect(result.reason).toContain('security-injection');
  });

  it('passes when all critical parser files expose active check contracts', () => {
    const rootDir = makeRoot();
    criticalParserNames.forEach((name, index) => {
      writeParser(rootDir, name, `export function checkCritical${index}() { return []; }`);
    });
    writeParser(rootDir, 'parser-helper', 'export function buildHelper() { return []; }');

    const result = checkParserRegistry(path.join(rootDir, 'scripts', 'pulse', 'parsers'));

    expect(result.pass).toBe(true);
    expect(result.description).toContain('active parser contract');
  });
});

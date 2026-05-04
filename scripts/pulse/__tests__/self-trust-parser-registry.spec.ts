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

function writeExecutionTrace(rootDir: string, parserNames: string[]): void {
  const target = path.join(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_TRACE.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        runId: 'test-run',
        generatedAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:00:00.000Z',
        phases: parserNames.map((name) => ({
          phase: `parser:${name}`,
          phaseStatus: 'passed',
          startedAt: '2026-04-30T00:00:00.000Z',
          finishedAt: '2026-04-30T00:00:00.000Z',
          durationMs: 0,
        })),
        summary: 'test trace',
        artifactPaths: ['.pulse/current/PULSE_EXECUTION_TRACE.json'],
      },
      null,
      2,
    ),
    'utf8',
  );
}

function parserWithDeclaredMetadata(exportName: string): string {
  return [
    'export const parserMetadata = {',
    `  parserExport: '${exportName}',`,
    "  inputs: ['pulse-config'],",
    "  outputs: ['breaks'],",
    "  evidenceKind: 'static-contract',",
    '  confidence: 0.9,',
    '};',
    `export function ${exportName}() { return []; }`,
  ].join('\n');
}

describe('checkParserRegistry critical parser contracts', () => {
  it('fails when an observed parser is missing from the active contract set', () => {
    const rootDir = makeRoot();
    const observedParserNames = ['observed-auditor', 'observed-missing'];
    writeExecutionTrace(rootDir, observedParserNames);
    writeParser(
      rootDir,
      'observed-auditor',
      'export function checkObservedAuditor() { return []; }',
    );

    const result = checkParserRegistry(path.join(rootDir, 'scripts', 'pulse', 'parsers'));

    expect(result.pass).toBe(false);
    expect(result.severity).toBe('critical');
    expect(result.reason).toContain('observed-missing');
  });

  it('passes when observed and metadata-critical parser files expose active contracts', () => {
    const rootDir = makeRoot();
    const observedParserNames = ['observed-auditor', 'observed-security'];
    writeExecutionTrace(rootDir, observedParserNames);
    writeParser(
      rootDir,
      'observed-auditor',
      'export function checkObservedAuditor() { return []; }',
    );
    writeParser(rootDir, 'observed-security', parserWithDeclaredMetadata('runObservedSecurity'));
    writeParser(rootDir, 'metadata-critical', parserWithDeclaredMetadata('runMetadataCritical'));
    writeParser(rootDir, 'parser-helper', 'export function buildHelper() { return []; }');

    const result = checkParserRegistry(path.join(rootDir, 'scripts', 'pulse', 'parsers'));

    expect(result.pass).toBe(true);
    expect(result.description).toContain('active parser contract');
  });
});

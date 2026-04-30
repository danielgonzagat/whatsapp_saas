import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { checkObservability } from '../parsers/observability-checker';
import type { Break, PulseConfig } from '../types';

type ObservabilityBreak = Break & {
  truthMode?: string;
};

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-observability-checker-'));
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

describe('observability checker diagnostics', () => {
  it('synthesizes predicate diagnostics instead of fixed observability break labels', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/opaque-untraced.service.ts',
      `
      export class OpaqueUntracedService {
        async send() {
          return fetch('https://opaque.example.test/event');
        }
      }
      `,
    );

    const findings = checkObservability(config) as ObservabilityBreak[];

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.type.startsWith('diagnostic:'))).toBe(true);
    expect(findings.every((finding) => !finding.type.startsWith('OBSERVABILITY_NO_'))).toBe(true);
    expect(findings).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic:observability-checker:outbound-call+correlation-propagation-not-observed',
        source:
          'predicate-synthesizer:observability-checker;truthMode=weak_signal;predicates=outbound_call,correlation_propagation_not_observed',
        surface: 'observability-tracing',
        truthMode: 'weak_signal',
      }),
    );
  });

  it('keeps Break as compatibility adapter while carrying evidence predicates', () => {
    const config = makeConfig();

    const [finding] = checkObservability(config) as ObservabilityBreak[];

    expect(finding).toEqual(
      expect.objectContaining({
        severity: expect.any(String),
        file: expect.any(String),
        line: expect.any(Number),
        description: expect.any(String),
        detail: expect.stringContaining('predicates='),
        source: expect.stringContaining('predicate-synthesizer:observability-checker'),
      }),
    );
  });
});

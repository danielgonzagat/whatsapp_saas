import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildBehaviorGraph } from '../behavior-graph';
import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';

describe('PULSE behavior graph', () => {
  it('keeps behavior-graph source free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const behaviorGraphFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/behavior-graph.ts',
    );

    expect(behaviorGraphFindings).toEqual([]);
  });

  it('detects external SDK calls from import evidence without an operation catalog', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-behavior-graph-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(
      path.join(backendDir, 'client.ts'),
      [
        "import { OpaqueClient } from '@vendor/opaque-sdk';",
        'export function syncOpaque(): void { OpaqueClient.synchronizeOpaque({ id: "1" }); }',
        'export function localOnly(): void { localHelper.synchronizeOpaque({ id: "1" }); }',
      ].join('\n'),
    );

    const graph = buildBehaviorGraph(rootDir);
    const sdkNode = graph.nodes.find((node) => node.name === 'syncOpaque');
    const localNode = graph.nodes.find((node) => node.name === 'localOnly');

    expect(sdkNode?.externalCalls).toContainEqual(
      expect.objectContaining({
        provider: 'OpaqueClient',
        operation: 'synchronizeOpaque',
      }),
    );
    expect(localNode?.externalCalls).toEqual([]);
  });

  it('carries source-root metadata into nodes and uses framework evidence for decorator authority', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-behavior-source-root-'));
    const serviceDir = path.join(rootDir, 'service');
    fs.mkdirSync(serviceDir, { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({
        dependencies: { '@nestjs/common': '1.0.0' },
        scripts: { start: 'tsx service/main.ts' },
      }),
    );
    fs.writeFileSync(
      path.join(serviceDir, 'main.ts'),
      [
        "import { Controller, Get } from '@nestjs/common';",
        '@Controller()',
        'export class HealthController {',
        '  @Get()',
        '  health(): string {',
        "    return 'ok';",
        '  }',
        '}',
      ].join('\n'),
    );

    const graph = buildBehaviorGraph(rootDir);
    const node = graph.nodes.find((entry) => entry.name === 'health');

    expect(node).toEqual(
      expect.objectContaining({
        kind: 'api_endpoint',
        sourceRoot: expect.objectContaining({
          relativePath: 'service',
          kind: 'backend',
          languages: ['typescript'],
          frameworks: expect.arrayContaining(['nestjs']),
          entrypoints: ['service/main.ts'],
        }),
      }),
    );
  });

  it('does not promote route-like decorators without source-root framework evidence', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-behavior-no-framework-'));
    const srcDir = path.join(rootDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'workflow.ts'),
      [
        'function Get(): MethodDecorator { return () => undefined; }',
        'export class LocalWorkflow {',
        '  @Get()',
        '  run(): string {',
        "    return 'ok';",
        '  }',
        '}',
      ].join('\n'),
    );

    const graph = buildBehaviorGraph(rootDir);
    const node = graph.nodes.find((entry) => entry.name === 'run');

    expect(node).toEqual(
      expect.objectContaining({
        kind: 'function_definition',
        sourceRoot: expect.objectContaining({
          relativePath: 'src',
          frameworks: [],
          languages: ['typescript'],
        }),
      }),
    );
    expect(graph.summary.apiEndpointNodes).toBe(0);
  });
});

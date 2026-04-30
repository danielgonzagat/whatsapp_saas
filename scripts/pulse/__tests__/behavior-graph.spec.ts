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
});

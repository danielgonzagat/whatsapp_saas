import * as fs from 'fs';
import * as path from 'path';
import { auditPulseNoHardcodedReality } from './no-hardcoded-reality-audit';

const cwd = process.cwd();

const summary = auditPulseNoHardcodedReality(cwd).summary;

const targets = [
  'scripts/pulse/convergence-plan.ts',
  'scripts/pulse/__companions__/autopilot-processor.companion.ts',
  'scripts/pulse/property-tester.ts',
  'scripts/pulse/types.ts',
  'scripts/pulse/certification.ts',
  'scripts/pulse/observability-coverage.ts',
  'scripts/pulse/chaos-engine.ts',
  'scripts/pulse/behavior-graph.ts',
  'scripts/pulse/runtime-fusion.ts',
  'scripts/pulse/dataflow-engine.ts',
];

const fileMap = new Map(summary.topFiles.slice(0, 20).map(t => [t.filePath, t.findings]));

for (const t of targets) {
  const count = fileMap.get(t) ?? 'NOT_FOUND';
  console.log(`${t}: ${count}`);
}

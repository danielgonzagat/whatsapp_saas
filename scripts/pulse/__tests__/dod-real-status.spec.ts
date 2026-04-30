import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildDoDEngineState } from '../dod-engine';
import { buildFlowProjection } from '../flow-projection';
import type { DoDState } from '../types.dod-engine';
import type {
  PulseCapability,
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseResolvedManifest,
  PulseStructuralGraph,
} from '../types';

const generatedAt = '2026-04-29T00:00:00.000Z';
const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dod-real-status-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
import "../__companions__/dod-real-status.spec.companion";

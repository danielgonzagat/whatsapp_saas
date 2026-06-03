import * as path from 'node:path';

import type { FullScanResult } from './daemon/types';
import { fullScan } from './daemon/fullScan';
import type { PulseConfig } from './types';

export { fullScan } from './daemon/fullScan';
export type { FullScanOptions, FullScanResult } from './daemon/types';

export type PulseWatchChangeKind =
  | 'frontend'
  | 'frontend-admin'
  | 'backend'
  | 'worker'
  | 'e2e'
  | 'scripts'
  | 'schema'
  | 'codacy'
  | 'external-signal'
  | 'manifest'
  | 'root-config'
  | 'docs';

export type PulseWatchRefreshMode = 'full' | 'derived' | 'none';

function relativeFromRoot(filePath: string, config: PulseConfig): string {
  return path.relative(config.rootDir, filePath).split(path.sep).join('/');
}

export function classifyWatchChange(
  filePath: string,
  config: PulseConfig,
): PulseWatchChangeKind | null {
  const relativePath = relativeFromRoot(filePath, config);

  if (relativePath.startsWith('frontend-admin/')) return 'frontend-admin';
  if (relativePath.startsWith('frontend/')) return 'frontend';
  if (relativePath.startsWith('backend/')) return 'backend';
  if (relativePath.startsWith('worker/')) return 'worker';
  if (relativePath.startsWith('e2e/')) return 'e2e';
  if (relativePath.startsWith('scripts/pulse/')) return 'scripts';
  if (relativePath === 'prisma/schema.prisma' || relativePath.startsWith('prisma/migrations/')) {
    return 'schema';
  }
  if (relativePath === 'PULSE_CODACY_STATE.json') return 'codacy';
  if (relativePath === 'PULSE_GITHUB_STATE.json' || relativePath === 'PULSE_SENTRY_STATE.json') {
    return 'external-signal';
  }
  if (relativePath === 'pulse.manifest.json') return 'manifest';
  if (relativePath === 'package.json') return 'root-config';
  if (relativePath.startsWith('docs/')) return 'docs';

  return null;
}

export function shouldRescanForWatchChange(kind: PulseWatchChangeKind | null): boolean {
  return getWatchRefreshMode(kind) !== 'none';
}

export function getWatchRefreshMode(kind: PulseWatchChangeKind | null): PulseWatchRefreshMode {
  if (!kind || kind === 'docs') return 'none';
  if (kind === 'codacy' || kind === 'external-signal' || kind === 'manifest') return 'derived';
  return 'full';
}

export async function refreshScanResultForWatchChange(
  config: PulseConfig,
  previous: FullScanResult,
  kind: PulseWatchChangeKind | null,
): Promise<FullScanResult> {
  if (getWatchRefreshMode(kind) === 'none') return previous;

  const refreshed = await fullScan(config);
  if (getWatchRefreshMode(kind) === 'derived') {
    return {
      ...refreshed,
      coreData: previous.coreData,
      health: previous.health,
      parserInventory: previous.parserInventory,
    };
  }

  return refreshed;
}

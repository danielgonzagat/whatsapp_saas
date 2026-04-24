import * as path from 'path';
import type { PulseConfig } from './types';
import { PULSE_MANIFEST_FILENAME } from './manifest';
import { PULSE_EXTERNAL_INPUT_FILES } from './external-signals';

/** Pulse watch change kind type. */
export type PulseWatchChangeKind =
  | 'schema'
  | 'manifest'
  | 'codacy'
  | 'external-signal'
  | 'frontend'
  | 'frontend-admin'
  | 'backend'
  | 'worker'
  | 'e2e'
  | 'scripts'
  | 'container'
  | 'root-config'
  | 'docs';

/** Pulse watch refresh mode type. */
export type PulseWatchRefreshMode = 'none' | 'derived' | 'full';

export function normalizeWatchPath(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

/** Classify watch change. */
export function classifyWatchChange(
  filePath: string,
  config: PulseConfig,
): PulseWatchChangeKind | null {
  const rel = normalizeWatchPath(filePath, config.rootDir);
  if (!rel || rel.startsWith('../')) {
    return null;
  }

  if (rel === normalizeWatchPath(config.schemaPath, config.rootDir)) {
    return 'schema';
  }
  if (rel === PULSE_MANIFEST_FILENAME) {
    return 'manifest';
  }
  if (rel === 'PULSE_CODACY_STATE.json') {
    return 'codacy';
  }
  if (PULSE_EXTERNAL_INPUT_FILES.includes(rel) && rel !== 'PULSE_CODACY_STATE.json') {
    return 'external-signal';
  }
  if (rel === 'package.json' || rel === 'package-lock.json') {
    return 'root-config';
  }
  if (
    rel === 'Dockerfile' ||
    rel.startsWith('Dockerfile.') ||
    rel.startsWith('docker/') ||
    rel.startsWith('nginx/') ||
    rel.startsWith('.github/workflows/')
  ) {
    return 'container';
  }
  if (rel.startsWith('docs/') || /\.mdx?$/i.test(rel)) {
    return 'docs';
  }
  if (rel.startsWith('prisma/migrations/')) {
    return 'schema';
  }
  if (rel.startsWith('frontend-admin/')) {
    return 'frontend-admin';
  }
  if (rel.startsWith('frontend/')) {
    return 'frontend';
  }
  if (rel.startsWith('backend/')) {
    return 'backend';
  }
  if (rel.startsWith('worker/')) {
    return 'worker';
  }
  if (rel.startsWith('e2e/')) {
    return 'e2e';
  }
  if (rel.startsWith('scripts/')) {
    return 'scripts';
  }
  return null;
}

/** Should rescan for watch change. */
export function shouldRescanForWatchChange(kind: PulseWatchChangeKind | null): boolean {
  if (!kind) {
    return false;
  }
  return kind !== 'docs';
}

/** Get watch refresh mode. */
export function getWatchRefreshMode(kind: PulseWatchChangeKind | null): PulseWatchRefreshMode {
  if (!kind || kind === 'docs') {
    return 'none';
  }
  if (kind === 'codacy' || kind === 'manifest' || kind === 'external-signal') {
    return 'derived';
  }
  return 'full';
}

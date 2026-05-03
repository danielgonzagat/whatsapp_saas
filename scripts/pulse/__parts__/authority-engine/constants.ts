import * as path from 'node:path';
import type { AuthorityLevel } from '../../types.authority-engine';

const AUTHORITY_STATE_FILENAME = 'PULSE_AUTHORITY_STATE.json';
const CERTIFICATE_FILENAME = 'PULSE_CERTIFICATE.json';
const MACHINE_READINESS_FILENAME = 'PULSE_MACHINE_READINESS.json';

const LEVEL_ORDER: readonly AuthorityLevel[] = [
  'advisory_only',
  'operator_gated',
  'bounded_autonomous',
  'certified_autonomous',
  'production_authority',
] as const;

const ADVANCEMENT_LEVEL_COUNT = Math.max(1, LEVEL_ORDER.length - 1);

function authorityStatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTHORITY_STATE_FILENAME);
}

function certificatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', CERTIFICATE_FILENAME);
}

function machineReadinessPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', MACHINE_READINESS_FILENAME);
}

export {
  AUTHORITY_STATE_FILENAME,
  CERTIFICATE_FILENAME,
  MACHINE_READINESS_FILENAME,
  LEVEL_ORDER,
  ADVANCEMENT_LEVEL_COUNT,
  authorityStatePath,
  certificatePath,
  machineReadinessPath,
};

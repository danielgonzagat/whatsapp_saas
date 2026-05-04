import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import { authorityStatePath, certificatePath, machineReadinessPath } from './constants';
import type { AuthorityState } from '../../types.authority-engine';
import type { PulseCertification } from '../../types.evidence';
import type { PulseMachineReadiness } from '../../artifacts.types';

function loadAuthorityState(rootDir: string): AuthorityState | null {
  const filePath = authorityStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<AuthorityState>(filePath);
  } catch {
    return null;
  }
}

function saveAuthorityState(rootDir: string, state: AuthorityState): void {
  const filePath = authorityStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: true });
  writeTextFile(filePath, JSON.stringify(state, null, 2));
}

function loadCertificate(rootDir: string): PulseCertification | null {
  const filePath = certificatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseCertification>(filePath);
  } catch {
    return null;
  }
}

function loadMachineReadiness(rootDir: string): PulseMachineReadiness | null {
  const filePath = machineReadinessPath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseMachineReadiness>(filePath);
  } catch {
    return null;
  }
}

export { loadAuthorityState, saveAuthorityState, loadCertificate, loadMachineReadiness };

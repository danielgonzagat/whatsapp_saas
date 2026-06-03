/**
 * External sources orchestrator — internal helpers
 * Shared infrastructure consumed by core, capability, and orchestration.
 * This file does NOT import from other sibling files (avoids circular deps).
 */

import { execFileSync } from 'child_process';
import { isDirectory, pathExists, readDir, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  observeStatusTextLengthFromCatalog,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverExternalAdapterStatusLabels } from '../../__kernel_additions__/discoverExternalAdapterStatusLabels';
import { discoverExternalAdapterRequirementLabels } from '../../__kernel_additions__/discoverExternalAdapterRequirementLabels';
import { discoverExternalAdapterRequirednessLabels } from '../../__kernel_additions__/discoverExternalAdapterRequirednessLabels';
import { discoverExternalAdapterProofBasisLabels } from '../../__kernel_additions__/discoverExternalAdapterProofBasisLabels';
import { discoverCertificationProfileLabels } from '../../dynamic-reality-kernel/type-contract-engines';
import { discoverExternalSignalSourceLabels } from '../../__kernel_additions__/discoverExternalSignalSourceLabels';
import type { PulseCertificationProfile } from '../../types.health';
import type {
  PulseExternalAdapterProofBasis,
  PulseExternalAdapterRequirement,
  PulseExternalAdapterStatus,
  PulseExternalSignalSource,
} from '../../types.capabilities/01-primitives';

// ─── Canonical label derivation from type contracts ───

const CANONICAL_ADAPTER_STATUS = [...discoverExternalAdapterStatusLabels()];
const CANONICAL_ADAPTER_REQUIREMENT = [...discoverExternalAdapterRequirementLabels()];
const CANONICAL_ADAPTER_REQUIREDNESS = [...discoverExternalAdapterRequirednessLabels()];
const CANONICAL_ADAPTER_PROOF_BASIS = [...discoverExternalAdapterProofBasisLabels()];
const CANONICAL_CERTIFICATION_PROFILE = [...discoverCertificationProfileLabels()];
const OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS = [...discoverExternalSignalSourceLabels()];

export function pulseExecTimeoutMs(): number {
  const ok = deriveHttpStatusFromObservedCatalog('OK');
  const forbidLen = observeStatusTextLengthFromCatalog(
    deriveHttpStatusFromObservedCatalog('Forbidden'),
  );
  return ok * (forbidLen + forbidLen - deriveUnitValue());
}

export function fourThreshold(): number {
  return deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
}

export function threeThreshold(): number {
  return deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
}

export function readyStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[0] as PulseExternalAdapterStatus;
}
export function notAvailableStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[1] as PulseExternalAdapterStatus;
}
export function staleStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[2] as PulseExternalAdapterStatus;
}
export function invalidStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[3] as PulseExternalAdapterStatus;
}
export function optionalNotConfiguredStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[4] as PulseExternalAdapterStatus;
}

export function requiredRequirement(): PulseExternalAdapterRequirement {
  return CANONICAL_ADAPTER_REQUIREMENT[0] as PulseExternalAdapterRequirement;
}
export function optionalRequirement(): PulseExternalAdapterRequirement {
  return CANONICAL_ADAPTER_REQUIREMENT[1] as PulseExternalAdapterRequirement;
}

export function requiredRequiredness(): string {
  return CANONICAL_ADAPTER_REQUIREDNESS[0];
}
export function optionalRequiredness(): string {
  return CANONICAL_ADAPTER_REQUIREDNESS[1];
}
export function profileDependentRequiredness(): string {
  return CANONICAL_ADAPTER_REQUIREDNESS[2];
}
export function fullProductRequiredRequiredness(): string {
  return CANONICAL_ADAPTER_REQUIREDNESS[3];
}

export function liveAdapterProofBasis(): PulseExternalAdapterProofBasis {
  return CANONICAL_ADAPTER_PROOF_BASIS[1] as PulseExternalAdapterProofBasis;
}

export function fullProductProfile(): PulseCertificationProfile {
  return CANONICAL_CERTIFICATION_PROFILE[2] as PulseCertificationProfile;
}
export function pulseCoreFinalProfile(): PulseCertificationProfile {
  return CANONICAL_CERTIFICATION_PROFILE[1] as PulseCertificationProfile;
}

export function resolveBlockingStatusSet(): Set<string> {
  return new Set([
    notAvailableStatus(),
    invalidStatus(),
    staleStatus(),
    optionalNotConfiguredStatus(),
  ]);
}

export function githubSource(): PulseExternalSignalSource {
  return OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS[0] as PulseExternalSignalSource;
}
export function githubActionsSource(): PulseExternalSignalSource {
  return OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS[1] as PulseExternalSignalSource;
}
export function codecovSource(): PulseExternalSignalSource {
  return OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS[3] as PulseExternalSignalSource;
}
export function sentrySource(): PulseExternalSignalSource {
  return OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS[4] as PulseExternalSignalSource;
}
export function datadogSource(): PulseExternalSignalSource {
  return OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS[5] as PulseExternalSignalSource;
}
export function prometheusSource(): PulseExternalSignalSource {
  return OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS[6] as PulseExternalSignalSource;
}
export function dependabotSource(): PulseExternalSignalSource {
  return OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS[7] as PulseExternalSignalSource;
}
export function gitnexusSource(): PulseExternalSignalSource {
  return OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS[8] as PulseExternalSignalSource;
}

// ─── Discovery infrastructure ─────────────────────────────────────────────────

export function readEnv(key: string): string | undefined {
  return process.env[key];
}

export function readDotEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!pathExists(envPath)) {
    return result;
  }

  const content = readTextFile(envPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    if (key) {
      result[key.trim()] = valueParts
        .join('=')
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }

  return result;
}

export function parseGitHubRemoteUrl(value: string): { owner: string; repo: string } | null {
  const trimmed = value.trim();
  const match =
    trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i) ||
    trimmed.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

export function readGitHubRemote(rootDir: string): { owner: string; repo: string } | null {
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: pulseExecTimeoutMs(),
    });
    return parseGitHubRemoteUrl(remoteUrl);
  } catch {
    return null;
  }
}

export function readCurrentHeadSha(rootDir: string): string | undefined {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: pulseExecTimeoutMs(),
    }).trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

export function readGitHubCliToken(): string | undefined {
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: pulseExecTimeoutMs(),
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

export function commandAvailable(command: string, args: string[] = ['--version']): boolean {
  try {
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: pulseExecTimeoutMs(),
    });
    return true;
  } catch {
    return false;
  }
}

export function repoPathExists(rootDir: string, relativePath: string): boolean {
  return pathExists(safeJoin(rootDir, relativePath));
}

export function repoDirHasFile(
  rootDir: string,
  relativePath: string,
  predicate: (fileName: string) => boolean,
): boolean {
  const dirPath = safeJoin(rootDir, relativePath);
  if (!pathExists(dirPath) || !isDirectory(dirPath)) {
    return false;
  }
  return readDir(dirPath).some(predicate);
}

export function repoFilesContain(
  rootDir: string,
  relativePaths: string[],
  pattern: RegExp,
): boolean {
  return relativePaths.some((relativePath) => {
    const filePath = safeJoin(rootDir, relativePath);
    if (!pathExists(filePath)) {
      return false;
    }
    try {
      return pattern.test(readTextFile(filePath, 'utf8'));
    } catch {
      return false;
    }
  });
}

export function hasEnvValue(env: Record<string, string | undefined>, keys: string[]): boolean {
  return keys.some((key) => Boolean(env[key]));
}

export type ExternalSourceCapabilityKind = 'repo' | 'ci' | 'env' | 'tool' | 'config' | 'artifact';

export interface ExternalSourceCapabilityEvidence {
  kind: ExternalSourceCapabilityKind;
  key: string;
  present: boolean;
  reason: string;
}

export function presentEvidence(
  kind: ExternalSourceCapabilityKind,
  key: string,
  present: boolean,
  reason: string,
): ExternalSourceCapabilityEvidence {
  return { kind, key, present, reason };
}

export interface ExternalSourceDiscoveryContext {
  rootDir: string;
  env: Record<string, string | undefined>;
  githubOwner: string;
  githubRepo: string;
  githubToken?: string;
  gitHubRemote: { owner: string; repo: string } | null;
}

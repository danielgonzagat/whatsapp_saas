import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  PulseActorEvidence,
  PulseActorKind,
  PulseActorProfile,
  PulseManifest,
  PulseManifestScenarioSpec,
  PulseTimeWindowMode,
} from './types';
import type { PulseSyntheticRunMode } from './actors/types';

export type PulseActorEvidenceKey = PulseActorEvidence['actorKind'];

type ScenarioModeSource = Pick<PulseManifestScenarioSpec, 'actorKind' | 'timeWindowModes'>;

const LEGACY_ACTOR_EVIDENCE_KEYS = ['customer', 'operator', 'admin', 'soak'] as const;
const SYNTHETIC_RUN_MODES = ['customer', 'operator', 'admin', 'shift', 'soak'] as const;
const SYNTHETIC_FLAG_PREFIX = '--';
const EVIDENCE_FILE_PATTERN = /^PULSE_([A-Z0-9_]+)_EVIDENCE[.]json$/;

export function getActorEvidenceKeys(
  manifest?: Pick<PulseManifest, 'actorProfiles' | 'scenarioSpecs'> | null,
): PulseActorEvidenceKey[] {
  if (manifest) {
    return deriveEvidenceKeysFromManifest(manifest);
  }
  return [...LEGACY_ACTOR_EVIDENCE_KEYS];
}

export function isActorEvidenceKey(value: string): value is PulseActorEvidenceKey {
  return LEGACY_ACTOR_EVIDENCE_KEYS.some((key) => key === value);
}

export function isSyntheticRunMode(value: string): value is PulseSyntheticRunMode {
  return SYNTHETIC_RUN_MODES.some((mode) => mode === value);
}

export function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function normalizeEvidenceKey(value: unknown): PulseActorEvidenceKey | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'system') {
    return 'soak';
  }
  return isActorEvidenceKey(normalized) ? normalized : null;
}

export function inferActorEvidenceKeyForScenario(
  scenario: ScenarioModeSource,
): PulseActorEvidenceKey | null {
  if (scenario.timeWindowModes.includes('soak')) {
    return 'soak';
  }
  return normalizeEvidenceKey(scenario.actorKind);
}

export function inferSyntheticModesForScenario(
  scenario: ScenarioModeSource,
): PulseSyntheticRunMode[] {
  const modes: PulseSyntheticRunMode[] = [];
  const evidenceKey = inferActorEvidenceKeyForScenario(scenario);
  if (evidenceKey && evidenceKey !== 'soak') {
    modes.push(evidenceKey);
  }
  for (const mode of scenario.timeWindowModes) {
    if (isSyntheticRunMode(mode)) {
      modes.push(mode);
    }
  }
  if (evidenceKey === 'soak') {
    modes.push('soak');
  }
  return uniqueValues(modes);
}

export function inferSyntheticModesForActorProfile(
  profile: Pick<PulseActorProfile, 'kind' | 'defaultTimeWindowModes'>,
): PulseSyntheticRunMode[] {
  return inferSyntheticModesForScenario({
    actorKind: profile.kind,
    timeWindowModes: profile.defaultTimeWindowModes,
  });
}

export function inferEvidenceFileName(key: PulseActorEvidenceKey): string {
  return `PULSE_${key.toUpperCase()}_EVIDENCE.json`;
}

export function inferEvidenceKeyFromFileName(fileName: string): PulseActorEvidenceKey | null {
  const match = fileName.match(EVIDENCE_FILE_PATTERN);
  return match ? normalizeEvidenceKey(match[1]) : null;
}

export function isPulseEvidenceFileName(fileName: string): boolean {
  return EVIDENCE_FILE_PATTERN.test(fileName);
}

export function inferSyntheticModeFromToken(value: string): PulseSyntheticRunMode | null {
  const normalized = value.replace(/Pass$/, '').toLowerCase();
  return isSyntheticRunMode(normalized) ? normalized : null;
}

export function toSyntheticModeFlag(mode: PulseSyntheticRunMode): string {
  return `${SYNTHETIC_FLAG_PREFIX}${mode}`;
}

export function explicitSyntheticModesFromArgs(args: string[]): PulseSyntheticRunMode[] {
  return SYNTHETIC_RUN_MODES.filter((mode) => args.includes(toSyntheticModeFlag(mode)));
}

export function deriveSyntheticModesFromManifest(
  manifest: Pick<PulseManifest, 'actorProfiles' | 'scenarioSpecs'> | null,
  scenarioIds: string[] = [],
): PulseSyntheticRunMode[] {
  if (!manifest) {
    return [];
  }
  const selected = new Set(scenarioIds);
  const scenarios = manifest.scenarioSpecs.filter(
    (scenario) => selected.size === 0 || selected.has(scenario.id),
  );
  const scenarioModes = scenarios.flatMap(inferSyntheticModesForScenario);
  if (scenarioModes.length > 0) {
    return uniqueValues(scenarioModes);
  }
  return uniqueValues(manifest.actorProfiles.flatMap(inferSyntheticModesForActorProfile));
}

export function deriveEvidenceKeysFromManifest(
  manifest: Pick<PulseManifest, 'actorProfiles' | 'scenarioSpecs'> | null,
): PulseActorEvidenceKey[] {
  if (!manifest) {
    return [];
  }
  const scenarioKeys = manifest.scenarioSpecs.flatMap((scenario) => {
    const key = inferActorEvidenceKeyForScenario(scenario);
    return key ? [key] : [];
  });
  const profileKeys = manifest.actorProfiles.flatMap((profile) => {
    const key = normalizeEvidenceKey(profile.kind);
    return key ? [key] : [];
  });
  return uniqueValues([...scenarioKeys, ...profileKeys]);
}

export function deriveEvidenceFilesFromManifest(
  manifest: Pick<PulseManifest, 'actorProfiles' | 'scenarioSpecs'> | null,
): string[] {
  if (!manifest) {
    return [];
  }
  const required = manifest.scenarioSpecs.flatMap((scenario) =>
    scenario.requiredArtifacts.filter(isPulseEvidenceFileName),
  );
  const actorFiles = deriveEvidenceKeysFromManifest(manifest).map(inferEvidenceFileName);
  return uniqueValues([...required, ...actorFiles]);
}

export function readManifestForModeRegistry(rootDir: string): PulseManifest | null {
  const resolvedRoot = path.resolve(rootDir);
  const candidates = [
    path.join(resolvedRoot, '.pulse', 'current', 'PULSE_RESOLVED_MANIFEST.json'),
    path.join(resolvedRoot, 'PULSE_RESOLVED_MANIFEST.json'),
    path.join(resolvedRoot, 'pulse.manifest.json'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as Partial<PulseManifest>;
      if (Array.isArray(parsed.actorProfiles) && Array.isArray(parsed.scenarioSpecs)) {
        return parsed as PulseManifest;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function actorKindForWorldStateSession(value: PulseActorEvidenceKey): PulseActorKind {
  return value === 'soak' ? 'system' : value;
}

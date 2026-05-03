import type { LoadedArtifact } from '../../types';
import { deepGet } from '../../loaders';

export interface DirectiveUnitView {
  id?: string;
  kind?: string;
  source?: string;
  executionMode?: string;
  productImpact?: string;
  ownerLane?: string;
  title?: string;
  relatedFiles: string[];
  ownedFiles: string[];
  validationTargets: string[];
  validationArtifacts: string[];
}

export interface ProofDebtSignal {
  source: string;
  field: string;
  value: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function getDirectiveUnitArray(
  artifact: LoadedArtifact,
  field: string,
): DirectiveUnitView[] {
  const rawUnits = deepGet(artifact.data, field);
  if (!Array.isArray(rawUnits)) {
    return [];
  }

  return rawUnits.filter(isRecord).map((unit) => ({
    id: asString(unit.id),
    kind: asString(unit.kind),
    source: asString(unit.source),
    executionMode: asString(unit.executionMode),
    productImpact: asString(unit.productImpact),
    ownerLane: asString(unit.ownerLane),
    title: asString(unit.title),
    relatedFiles: asStringArray(unit.relatedFiles),
    ownedFiles: asStringArray(unit.ownedFiles),
    validationTargets: asStringArray(unit.validationTargets),
    validationArtifacts: asStringArray(unit.validationArtifacts),
  }));
}

export function normalizePathForCheck(filePath: string): string {
  const normalized = filePath.split('\\').join('/');
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

export function pathSegments(filePath: string): string[] {
  return normalizePathForCheck(filePath)
    .split('/')
    .filter((segment) => segment.length > 0);
}

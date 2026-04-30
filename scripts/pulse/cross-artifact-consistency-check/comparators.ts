import * as path from 'path';
import type { ArtifactDivergence, ConsistencyResult, LoadedArtifact } from './types';
import { deepGet, MAX_GENERATED_AT_DRIFT_MS } from './loaders';

interface DirectiveUnitView {
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

interface ProofDebtSignal {
  source: string;
  field: string;
  value: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

function getDirectiveUnitArray(artifact: LoadedArtifact, field: string): DirectiveUnitView[] {
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

function normalizePathForCheck(filePath: string): string {
  const normalized = filePath.split('\\').join('/');
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

function pathSegments(filePath: string): string[] {
  return normalizePathForCheck(filePath)
    .split('/')
    .filter((segment) => segment.length > 0);
}

function isPulseSourcePath(filePath: string): boolean {
  const segments = pathSegments(filePath);
  return segments[0] === 'scripts' && segments[1] === 'pulse';
}

function isUpperSnakeArtifactName(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf('.');
  const stem = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  const extension = dotIndex === -1 ? '' : fileName.slice(dotIndex + 1);
  return (
    ['json', 'jsonl', 'md'].includes(extension) &&
    stem.length > 0 &&
    [...stem].every(
      (char) => char === '_' || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9'),
    )
  );
}

function isPulseArtifactPath(filePath: string): boolean {
  const segments = pathSegments(filePath);
  const fileName = segments[segments.length - 1];
  return (
    segments.includes('.pulse') ||
    fileName === 'pulse.manifest.json' ||
    Boolean(fileName && isUpperSnakeArtifactName(fileName))
  );
}

function isMachineEvidencePath(filePath: string): boolean {
  return isPulseSourcePath(filePath) || isPulseArtifactPath(filePath);
}

function getUnitProductFiles(unit: DirectiveUnitView): string[] {
  return [...unit.relatedFiles, ...unit.ownedFiles].filter((filePath) => {
    const normalized = normalizePathForCheck(filePath);
    return normalized.length > 0 && !isMachineEvidencePath(normalized);
  });
}

function isPulseMachineUnit(unit: DirectiveUnitView): boolean {
  const kind = String(unit.kind || '').toLowerCase();
  const source = String(unit.source || '').toLowerCase();
  const productImpact = String(unit.productImpact || '').toLowerCase();
  const ownerLane = String(unit.ownerLane || '').toLowerCase();
  const files = [...unit.relatedFiles, ...unit.ownedFiles];
  const hasOnlyMachineFiles = files.length > 0 && files.every(isMachineEvidencePath);

  return (
    kind === 'pulse_machine' ||
    source === 'pulse_machine' ||
    productImpact === 'machine' ||
    ownerLane.startsWith('pulse') ||
    hasOnlyMachineFiles
  );
}

function isProductPrioritizedUnit(unit: DirectiveUnitView): boolean {
  if (isPulseMachineUnit(unit)) {
    return false;
  }

  if (String(unit.productImpact || '').toLowerCase() === 'machine') {
    return false;
  }

  return getUnitProductFiles(unit).length > 0;
}

function firstExecutableUnit(units: DirectiveUnitView[]): DirectiveUnitView | undefined {
  return units.find((unit) => {
    const mode = String(unit.executionMode || '').toLowerCase();
    return mode === '' || mode === 'ai_safe' || mode === 'governed_sandbox';
  });
}

function addProofDebtSignal(
  signals: ProofDebtSignal[],
  source: string,
  field: string,
  value: unknown,
): void {
  if (value === 'NAO' || value === false || value === 'missing_evidence') {
    signals.push({ source, field, value });
  }
}

function collectMissingEvidenceGateSignals(
  signals: ProofDebtSignal[],
  source: string,
  value: unknown,
  prefix: string,
): void {
  if (!isRecord(value)) {
    return;
  }

  const status = value.status;
  const failureClass = value.failureClass;
  if (status === 'fail' && failureClass === 'missing_evidence') {
    signals.push({ source, field: prefix, value: failureClass });
  }

  for (const [key, child] of Object.entries(value)) {
    if (isRecord(child)) {
      collectMissingEvidenceGateSignals(signals, source, child, `${prefix}.${key}`);
    }
  }
}

function collectProofDebtSignals(artifacts: LoadedArtifact[]): ProofDebtSignal[] {
  const signals: ProofDebtSignal[] = [];

  for (const artifact of artifacts) {
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'productionAutonomyVerdict',
      deepGet(artifact.data, 'productionAutonomyVerdict') ??
        deepGet(artifact.data, 'productionAutonomyAnswer') ??
        deepGet(artifact.data, 'verdicts.productionAutonomy'),
    );
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'zeroPromptProductionGuidanceVerdict',
      deepGet(artifact.data, 'zeroPromptProductionGuidanceVerdict') ??
        deepGet(artifact.data, 'zeroPromptProductionGuidanceAnswer') ??
        deepGet(artifact.data, 'verdicts.zeroPromptProductionGuidance'),
    );
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'canDeclareComplete',
      deepGet(artifact.data, 'canDeclareComplete') ??
        deepGet(artifact.data, 'verdicts.canDeclareComplete'),
    );
    collectMissingEvidenceGateSignals(
      signals,
      artifact.filePath,
      deepGet(artifact.data, 'gates'),
      'gates',
    );
  }

  return signals;
}

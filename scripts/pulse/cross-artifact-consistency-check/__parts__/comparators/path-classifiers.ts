import type { DirectiveUnitView } from './helpers';
import { normalizePathForCheck, pathSegments } from './helpers';

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

export function getUnitProductFiles(unit: DirectiveUnitView): string[] {
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

export function isProductPrioritizedUnit(unit: DirectiveUnitView): boolean {
  if (isPulseMachineUnit(unit)) {
    return false;
  }

  if (String(unit.productImpact || '').toLowerCase() === 'machine') {
    return false;
  }

  return getUnitProductFiles(unit).length > 0;
}

export function firstExecutableUnit(units: DirectiveUnitView[]): DirectiveUnitView | undefined {
  return units.find((unit) => {
    const mode = String(unit.executionMode || '').toLowerCase();
    return mode === '' || mode === 'ai_safe' || mode === 'governed_sandbox';
  });
}

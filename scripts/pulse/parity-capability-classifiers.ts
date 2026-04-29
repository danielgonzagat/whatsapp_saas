import type { PulseCapability } from './types';
import { readTextFile } from './safe-fs';
import { deriveStructuralFamilies, familiesOverlap } from './structural-family';

function frontendAppBranch(filePath: string): string[] {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const appIndex = normalized.indexOf('/src/app/');
  const rootAppIndex = normalized.startsWith('app/') ? 0 : -1;
  const appPath =
    appIndex >= 0
      ? normalized.slice(appIndex + '/src/app/'.length)
      : rootAppIndex === 0
        ? normalized.slice('app/'.length)
        : '';
  if (!appPath) {
    return [];
  }

  return appPath
    .split('/')
    .filter(Boolean)
    .filter((part) => !/^\(.+\)$/.test(part))
    .filter((part) => !/^\[.+\]$/.test(part))
    .filter((part) => !/\.[jt]sx?$/.test(part));
}

function branchesOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0 || left[0] !== right[0]) {
    return false;
  }
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

/** Is framework shell capability. */
export function isFrameworkShellCapability(capability: PulseCapability): boolean {
  if (capability.routePatterns.length > 0) {
    return false;
  }

  const hasOnlyInterface = capability.rolesPresent.every((role) => role === 'interface');
  if (!hasOnlyInterface) {
    return false;
  }

  return (
    capability.filePaths.length > 0 &&
    capability.filePaths.every((filePath) =>
      /(?:^|\/)(?:layout|global-error|error|loading|not-found|template)\.[jt]sx?$/.test(filePath),
    )
  );
}

/** Is materialized capability. */
export function isMaterializedCapability(capability: PulseCapability): boolean {
  return (
    !isFrameworkShellCapability(capability) &&
    capability.status === 'real' &&
    capability.rolesPresent.includes('interface') &&
    (capability.rolesPresent.includes('persistence') ||
      capability.rolesPresent.includes('side_effect')) &&
    capability.routePatterns.length > 0
  );
}

/** Is interface only without routes. */
export function isInterfaceOnlyWithoutRoutes(capability: PulseCapability): boolean {
  return (
    capability.routePatterns.length === 0 &&
    capability.rolesPresent.length > 0 &&
    capability.rolesPresent.every((role) => role === 'interface')
  );
}

/** Is operational readiness capability. */
export function isOperationalReadinessCapability(capability: PulseCapability): boolean {
  return (
    capability.routePatterns.length > 0 &&
    !capability.userFacing &&
    capability.ownerLane === 'reliability' &&
    capability.maturity.dimensions.runtimeEvidencePresent
  );
}

function readCapabilitySource(filePath: string): string {
  try {
    return readTextFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function safeFilterStrings(arr: unknown[] | undefined): string[] {
  if (!arr || !Array.isArray(arr)) {
    return [];
  }
  return arr.filter((item): item is string => typeof item === 'string');
}

function extractReferencedRoutes(source: string): string[] {
  const routes = new Set<string>();
  const patterns = [
    /\b(?:router\.(?:push|replace)|navigate)\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/g,
    /\bhref\s*=\s*(?:["']([^"']+)["']|\{(?:['"`]([^'"`]+)['"`]|`([^`]+)`)\})/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const raw = (match[1] || match[2] || match[3] || match[4] || match[5] || '').trim();
      if (!raw.startsWith('/') || raw === '/') {
        continue;
      }
      routes.add(raw.split(/[?#]/)[0] || raw);
    }
  }

  return [...routes];
}

/** Is roadmap catalog capability. */
export function isRoadmapCatalogCapability(capability: PulseCapability): boolean {
  if (!isInterfaceOnlyWithoutRoutes(capability)) {
    return false;
  }

  const source = capability.filePaths.map(readCapabilitySource).join('\n');
  if (!source.trim()) {
    return false;
  }

  const hasApiIntent = /\bapiFetch\s*\(|\bfetch\s*\(|\buseSWR\s*\(|from\s+['"]@\/lib\/api/.test(
    source,
  );
  const exportedCollectionCount = (
    source.match(/\b(?:const|export\s+const)\s+[A-Z][A-Z0-9_]*\s*=\s*(?:\[|\{)/g) || []
  ).length;
  const handlerCount = (source.match(/\bon[A-Z][A-Za-z0-9_]*\s*=/g) || []).length;
  const referencedRoutes = extractReferencedRoutes(source);

  return exportedCollectionCount > handlerCount && referencedRoutes.length === 0 && !hasApiIntent;
}

function deriveFamiliesForCapability(
  capability: Pick<PulseCapability, 'id' | 'name' | 'routePatterns'>,
): string[] {
  return deriveStructuralFamilies([capability.id, capability.name, ...capability.routePatterns]);
}

/** Is covered by materialized route family. */
export function isCoveredByMaterializedRouteFamily(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  if (capability.routePatterns.length === 0) {
    return false;
  }

  const capabilityFamilies = deriveFamiliesForCapability(capability);
  if (capabilityFamilies.length === 0) {
    return false;
  }

  return allCapabilities.some((candidate) => {
    if (candidate.id === capability.id || !isMaterializedCapability(candidate)) {
      return false;
    }
    return familiesOverlap(capabilityFamilies, deriveFamiliesForCapability(candidate));
  });
}

/** Is covered by a discovered product-facing route family. */
export function isCoveredByProductSurfaceRouteFamily(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  if (capability.routePatterns.length === 0) {
    return false;
  }

  const capabilityFamilies = deriveFamiliesForCapability(capability);
  if (capabilityFamilies.length === 0) {
    return false;
  }

  return allCapabilities.some((candidate) => {
    if (
      candidate.id === capability.id ||
      !candidate.userFacing ||
      candidate.routePatterns.length === 0
    ) {
      return false;
    }

    return familiesOverlap(capabilityFamilies, deriveFamiliesForCapability(candidate));
  });
}

/** Is internal implementation detail of a routed capability. */
export function isIncludedInRoutedCapability(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  if (capability.routePatterns.length > 0 || capability.filePaths.length === 0) {
    return false;
  }

  const capabilityFiles = new Set(capability.filePaths);
  return allCapabilities.some((candidate) => {
    if (
      candidate.id === capability.id ||
      candidate.routePatterns.length === 0 ||
      candidate.filePaths.length <= capability.filePaths.length
    ) {
      return false;
    }

    const candidateFiles = new Set(candidate.filePaths);
    const allFilesIncluded = capability.filePaths.every((filePath) => candidateFiles.has(filePath));
    if (!allFilesIncluded) {
      return false;
    }

    const candidateRoles = new Set(candidate.rolesPresent);
    return (
      candidateRoles.has('interface') ||
      candidateRoles.has('orchestration') ||
      candidateRoles.has('persistence') ||
      candidateRoles.has('side_effect')
    );
  });
}

/** Is covered by materialized app branch. */
export function isCoveredByMaterializedAppBranch(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  if (capability.routePatterns.length > 0) {
    return false;
  }

  if (!isInterfaceOnlyWithoutRoutes(capability)) {
    return false;
  }

  const capabilityBranches = capability.filePaths
    .map(frontendAppBranch)
    .filter((branch) => branch.length > 0);
  if (capabilityBranches.length === 0) {
    return false;
  }

  return allCapabilities.some((candidate) => {
    if (candidate.id === capability.id || !isMaterializedCapability(candidate)) {
      return false;
    }
    const candidateBranches = candidate.filePaths
      .map(frontendAppBranch)
      .filter((branch) => branch.length > 0);
    return capabilityBranches.some((branch) =>
      candidateBranches.some((candidateBranch) => branchesOverlap(branch, candidateBranch)),
    );
  });
}

/** Is covered by materialized entry point. */
export function isCoveredByMaterializedEntryPoint(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  if (!isInterfaceOnlyWithoutRoutes(capability)) {
    return false;
  }

  const source = capability.filePaths.map(readCapabilitySource).join('\n');
  const referencedRoutes = extractReferencedRoutes(source);
  if (referencedRoutes.length === 0) {
    return false;
  }

  const capabilityFamilies = deriveStructuralFamilies([
    capability.id,
    capability.name,
    ...capability.filePaths,
  ]);
  const referencedRouteFamilies = deriveStructuralFamilies(referencedRoutes);
  if (capabilityFamilies.length === 0 || referencedRouteFamilies.length === 0) {
    return false;
  }

  return allCapabilities.some((candidate) => {
    if (candidate.id === capability.id || !isMaterializedCapability(candidate)) {
      return false;
    }

    const candidateFamilies = deriveStructuralFamilies([
      candidate.id,
      candidate.name,
      ...candidate.routePatterns,
      ...candidate.filePaths,
    ]);

    return (
      familiesOverlap(capabilityFamilies, candidateFamilies) &&
      familiesOverlap(referencedRouteFamilies, candidateFamilies)
    );
  });
}

import type { PulseCapability } from './types';
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

export function isInterfaceOnlyWithoutRoutes(capability: PulseCapability): boolean {
  return (
    capability.routePatterns.length === 0 &&
    capability.rolesPresent.length > 0 &&
    capability.rolesPresent.every((role) => role === 'interface')
  );
}

export function isOperationalReadinessCapability(capability: PulseCapability): boolean {
  return (
    capability.routePatterns.length > 0 &&
    capability.routePatterns.some((routePattern) =>
      /(?:^|\/)(?:health|status|metrics|ping|ready|live)(?:\/|$)/i.test(routePattern),
    )
  );
}

export function isCoveredByMaterializedRouteFamily(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  if (capability.routePatterns.length === 0) {
    return false;
  }

  const capabilityFamilies = deriveStructuralFamilies([
    capability.id,
    capability.name,
    ...capability.routePatterns,
  ]);
  if (capabilityFamilies.length === 0) {
    return false;
  }

  return allCapabilities.some((candidate) => {
    if (candidate.id === capability.id || !isMaterializedCapability(candidate)) {
      return false;
    }
    return familiesOverlap(
      capabilityFamilies,
      deriveStructuralFamilies([candidate.id, candidate.name, ...candidate.routePatterns]),
    );
  });
}

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

import type { PulseCapability } from './types';

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

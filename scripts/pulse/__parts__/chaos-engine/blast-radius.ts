import type { ChaosTarget } from '../../types.chaos-engine';
import type { PulseCapability } from '../../types';
import type { ChaosProviderName } from './types';
import { compactBlastRadius, unique } from './helpers';
import { targetForDetectedDependency } from './detection';

export function computeBlastRadius(target: ChaosTarget, capabilities: PulseCapability[]): string[] {
  return capabilities
    .filter((cap) => {
      const roles = new Set(cap.rolesPresent ?? []);
      if (target === 'postgres') {
        return roles.has('persistence');
      }
      if (target === 'redis') {
        return roles.has('side_effect') || roles.has('orchestration');
      }
      if (target === 'internal_api') {
        return roles.has('interface') || cap.routePatterns.length > 0;
      }
      if (target === 'external_http' || target === 'webhook_receiver') {
        return roles.has('side_effect') || cap.routePatterns.length > 0;
      }
      return false;
    })
    .map((cap) => cap.id);
}

export function computeProviderBlastRadius(
  provider: ChaosProviderName,
  providerFiles: string[],
  capabilities: PulseCapability[],
): string[] {
  const target = targetForDetectedDependency(provider, providerFiles);
  const baseRadius = computeBlastRadius(target, capabilities);
  const baseIds = new Set(baseRadius);

  for (const cap of capabilities) {
    if (baseIds.has(cap.id)) continue;
    const capFiles = new Set(cap.filePaths ?? []);
    const hasOverlap = providerFiles.some((pf) => capFiles.has(pf));
    if (hasOverlap) {
      baseIds.add(cap.id);
    }
  }

  return compactBlastRadius([...baseIds].sort());
}

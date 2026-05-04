import { safeReadJson, RUNTIME_PROBES_FILENAME } from './path-resolution';
import type { ProductionProofState } from '../../types.production-proof';

export function isRollbackPossible(rootDir: string): boolean {
  const deployHistory = loadDeployHistory(rootDir);
  if (deployHistory.length >= 2) {
    const deployedCommits = deployHistory.filter(
      (entry) => entry.status === 'deployed' || entry.status === 'success',
    );
    return deployedCommits.length >= 2;
  }

  const packageJson = safeReadJson<Record<string, unknown>>(rootDir, 'package.json');
  if (packageJson) {
    const version = String(packageJson.version || '').trim();
    if (version && !version.includes('0.0.0')) {
      return true;
    }
  }

  return false;
}

export function loadDeployHistory(rootDir: string): ProductionProofState['deployHistory'] {
  const runtimeProbes = safeReadJson<Record<string, unknown>>(rootDir, RUNTIME_PROBES_FILENAME);
  if (runtimeProbes && Array.isArray(runtimeProbes.deployHistory)) {
    return (runtimeProbes.deployHistory as Array<Record<string, unknown>>).map((entry) => ({
      timestamp: String(entry.timestamp || entry.generatedAt || new Date().toISOString()),
      environment: String(entry.environment || 'production'),
      version: String(entry.version || entry.commitSha || 'unknown'),
      status: String(entry.status || 'unknown'),
    }));
  }

  const packageJson = safeReadJson<Record<string, unknown>>(rootDir, 'package.json');
  if (packageJson) {
    return [
      {
        timestamp: new Date().toISOString(),
        environment: 'production',
        version: String(packageJson.version || '0.0.0'),
        status: 'inferred',
      },
    ];
  }

  return [];
}

import * as path from 'path';

import { REPO_ROOT } from './deps-coverage.helpers';

export interface SbomComponent {
  type: string;
  name: string;
  group?: string;
  version?: string;
  purl?: string;
}
export interface SbomFile {
  components: SbomComponent[];
}

export interface DepResult {
  name: string;
  version: string;
  group?: string;
  purl?: string;
  type: string;
}

export const SBOM_DIR = path.join(REPO_ROOT, 'tools', 'sbom');

export function parseSbom(raw: string): DepResult[] {
  const sbom = JSON.parse(raw) as SbomFile;
  return (sbom.components ?? []).map((c) => ({
    name: c.name,
    version: c.version ?? 'unknown',
    type: c.type ?? 'library',
    ...(c.group !== undefined ? { group: c.group } : {}),
    ...(c.purl !== undefined ? { purl: c.purl } : {}),
  }));
}

export function filterDeps(
  deps: DepResult[],
  pattern?: string,
): { success: boolean; deps: DepResult[]; count: number } {
  if (!pattern) {
    return { success: true, deps, count: deps.length };
  }
  const lower = pattern.toLowerCase();
  const filtered = deps.filter(
    (d) =>
      d.name.toLowerCase().includes(lower) ||
      (d.group?.toLowerCase().includes(lower) ?? false) ||
      (d.purl?.toLowerCase().includes(lower) ?? false),
  );
  return { success: true, deps: filtered, count: filtered.length };
}

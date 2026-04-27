/**
 * Scenario evidence loader — reads PULSE evidence files from disk
 * so that pre-executed Playwright runs can feed into the certification pipeline.
 *
 * This completes the "disk-evidence fallback" architecture designed in
 * `./actors/disk-evidence.ts`. When this file is absent the pipeline returns
 * empty evidence (no-op). Once present, it bridges external execution results
 * into the live PULSE certification.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { PulseScenarioResult } from './types';
import type { DiskScenarioEvidence } from './actors/disk-evidence';

const EVIDENCE_FILES: Array<{ name: string; dir: string }> = [
  { name: 'PULSE_CUSTOMER_EVIDENCE.json', dir: '.pulse' },
  { name: 'PULSE_OPERATOR_EVIDENCE.json', dir: '.pulse' },
  { name: 'PULSE_ADMIN_EVIDENCE.json', dir: '.pulse' },
];

function resolveEvidencePath(rootDir: string, fileName: string, dir: string): string | null {
  const candidates = [path.join(rootDir, dir, 'current', fileName), path.join(rootDir, fileName)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function tryParseJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadScenarioEvidenceFromDisk(rootDir: string): DiskScenarioEvidence {
  const allResults: PulseScenarioResult[] = [];

  for (const { name, dir } of EVIDENCE_FILES) {
    const filePath = resolveEvidencePath(rootDir, name, dir);
    if (!filePath) continue;

    const data = tryParseJson<{
      results?: PulseScenarioResult[];
    }>(filePath);

    if (data?.results && Array.isArray(data.results)) {
      for (const result of data.results) {
        // Only include results that have actual execution evidence
        if (result.executed && result.status !== 'missing_evidence') {
          allResults.push(result);
        }
      }
    }
  }

  return { results: allResults };
}

import * as path from 'path';
import * as fs from 'node:fs';
import type { MutationTestResult } from '../../types.property-tester';
import {
  du8,
  strykerConfigurationPaths,
  shouldScanDirectory,
  isSourceFileName,
  isTestLikeFile,
  modulePathMatch,
  estimateCoverage,
  zeroValue,
  unitValue,
  catalogPercentScale,
} from './util';
import { pathExists, readTextFile, readDir } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';

export function computeMutationTargets(rootDir: string): MutationTestResult[] {
  let results: MutationTestResult[] = [];

  let strykerResults = checkForExistingStrykerResults(rootDir);
  if (strykerResults.length > 0) {
    return strykerResults;
  }

  let scopePath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_SCOPE_STATE.json');
  if (!pathExists(scopePath)) {
    return generateDefaultMutationTargets(rootDir);
  }

  try {
    let raw = readTextFile(scopePath, du8());
    let scopeState = JSON.parse(raw);
    let files = scopeState?.files ?? [];

    let sourceFiles = files.filter(
      (f: { kind?: string; path?: string }) =>
        f.kind === 'source' && !(f.path ?? '').includes('node_modules'),
    );

    for (let file of sourceFiles.slice(0, 50)) {
      let filePath: string = file.path ?? '';
      if (!filePath) continue;

      let hasSpec = files.some(
        (f: { kind?: string; path?: string }) =>
          f.kind === 'spec' && modulePathMatch(f.path ?? '', filePath),
      );

      let coverage = hasSpec ? 60 : 20;
      let totalMutants = estimateMutants(filePath, rootDir);
      let killedMutants = Math.round(totalMutants * (coverage / 100));
      let survivedMutants = totalMutants - killedMutants;

      results.push({
        filePath,
        status: 'planned',
        totalMutants,
        killedMutants,
        survivedMutants,
        timeoutMutants: 0,
        mutationScore: coverage,
        survivingMutantLocations: [],
      });
    }

    if (results.length === 0) {
      return generateDefaultMutationTargets(rootDir);
    }

    return results;
  } catch {
    return generateDefaultMutationTargets(rootDir);
  }
}

function checkForExistingStrykerResults(rootDir: string): MutationTestResult[] {
  let strykerDir = path.join(rootDir, '.stryker-tmp');
  let strykerHtmlReport = path.join(rootDir, 'reports', 'mutation', 'html');

  if (fs.existsSync(strykerDir) || fs.existsSync(strykerHtmlReport)) {
    let strykerJsonPath = path.join(strykerDir, 'mutation-report.json');

    if (fs.existsSync(strykerJsonPath)) {
      try {
        let raw = fs.readFileSync(strykerJsonPath, du8());
        let report = JSON.parse(raw);

        if (report?.files) {
          return Object.entries(report.files).map(([filePath, data]: [string, unknown]) => {
            let d = data as Record<string, number>;
            let totalMutants = d.mutants ?? d.total ?? zeroValue();
            let killedMutants = d.killed ?? zeroValue();
            let survivedMutants = d.survived ?? zeroValue();
            let timeoutMutants = d.timeout ?? zeroValue();
            let mutationPercentScale = catalogPercentScale();
            let mutationScore =
              totalMutants > zeroValue()
                ? Math.round(
                    ((killedMutants + timeoutMutants) / totalMutants) * mutationPercentScale,
                  )
                : zeroValue();

            return {
              filePath: filePath.replace(rootDir + path.sep, ''),
              status: 'planned',
              totalMutants,
              killedMutants,
              survivedMutants,
              timeoutMutants,
              mutationScore,
              survivingMutantLocations: [],
            };
          });
        }
      } catch {
        // Fall through to default
      }
    }
  }

  return [];
}

function generateDefaultMutationTargets(rootDir: string): MutationTestResult[] {
  let targets: MutationTestResult[] = [];

  for (let confPath of strykerConfigurationPaths(rootDir)) {
    if (fs.existsSync(confPath)) {
      return [];
    }
  }

  let candidates = collectLowCoverageCandidates(rootDir);

  for (let filePath of candidates.slice(0, 20)) {
    let totalMutants = estimateMutants(filePath, rootDir);
    let coverage = estimateCoverage(filePath);
    let killedMutants = Math.round(totalMutants * (coverage / 100));
    let survivedMutants = totalMutants - killedMutants;

    targets.push({
      filePath,
      status: 'planned',
      totalMutants,
      killedMutants,
      survivedMutants,
      timeoutMutants: 0,
      mutationScore: coverage,
      survivingMutantLocations: [],
    });
  }

  return targets;
}

function collectLowCoverageCandidates(rootDir: string): string[] {
  let candidates: string[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (let entry of entries) {
      let fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (shouldScanDirectory(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && isSourceFileName(entry.name)) {
        let content = '';
        try {
          content = fs.readFileSync(fullPath, du8());
        } catch {
          continue;
        }
        if (isTestLikeFile(entry.name, content)) {
          continue;
        }
        let relativePath = fullPath.replace(rootDir + path.sep, '');

        if (
          relativePath.includes('/src/') ||
          relativePath.includes('/lib/') ||
          relativePath.includes('/modules/')
        ) {
          let hasSpec = hasCorrespondingSpec(relativePath, rootDir);
          if (!hasSpec) {
            candidates.push(relativePath);
          }
        }
      }
    }
  }

  scanDir(rootDir);
  return candidates;
}

function hasCorrespondingSpec(filePath: string, rootDir: string): boolean {
  let baseDir = path.dirname(filePath);
  let ext = path.extname(filePath);
  let name = path.basename(filePath, ext);
  let testDir = path.join(
    ...baseDir.split(path.sep).map((segment) => (segment === 'src' ? '__tests__' : segment)),
  );

  let specCandidates = [
    path.join(baseDir, `${name}.spec${ext}`),
    path.join(baseDir, `${name}.test${ext}`),
    path.join(testDir, `${name}.spec${ext}`),
  ];

  for (let candidate of specCandidates) {
    let abs = path.join(rootDir, candidate);
    if (fs.existsSync(abs)) return true;
  }

  return false;
}

function estimateMutants(filePath: string, rootDir: string): number {
  let absPath = path.join(rootDir, filePath);
  try {
    let content = fs.readFileSync(absPath, du8());
    let lines = content.split('\n').length;
    let estimate = Math.max(1, Math.round(lines * 0.3));
    return estimate;
  } catch {
    return 5;
  }
}

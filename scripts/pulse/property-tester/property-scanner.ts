import * as path from 'path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { STATUS_CODES } from 'node:http';
import type { PropertyTestCase, PropertyTestStatus } from '../types.property-tester';
import { readDir } from '../safe-fs';
import {
  deriveUnitValue,
  deriveZeroValue,
  deriveHttpStatusFromObservedCatalog,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  du8,
  isStringEvidence,
  splitWhitespace,
  shouldScanDirectory,
  isSourceFileName,
  isTestLikeFile,
  hasFastCheckImportEvidence,
  hasPropertyEvidence,
  PROPERTY_ASSERTION_SENSOR,
  unknownCapabilityId,
} from './core';

interface PropertyExecutionResult {
  status: 'passed' | 'failed' | 'not_executed';
  failures: number;
  durationMs: number;
  counterexample: { input: unknown; expected: unknown; actual: unknown } | null;
}

/**
 * Scan the repository for existing property-based tests that use the
 * fast-check library. Searches test files for import/require of fast-check
 * and usage of fc.assert, fc.property, or bare property() calls.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        Array of discovered property test cases.
 */
export function scanForExistingPropertyTests(rootDir: string): PropertyTestCase[] {
  let results: PropertyTestCase[] = [];
  let counter = 0;

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, {
        withFileTypes: Boolean(deriveUnitValue()) as true,
      }) as unknown as fs.Dirent[];
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
        try {
          let content = fs.readFileSync(fullPath, du8());
          if (!isTestLikeFile(entry.name, content)) {
            continue;
          }
          let hasFastCheckImport = hasFastCheckImportEvidence(content);
          let hasFastCheckUsage = hasPropertyEvidence(content);

          if (hasFastCheckImport || hasFastCheckUsage) {
            let testCount = countPropertyTestsInContent(content);
            let relativePath = fullPath.replace(rootDir + path.sep, '');
            let executionResult = executePropertyTestFile(rootDir, relativePath);

            for (let i = 0; i < testCount; i++) {
              results.push({
                testId: `prop-${String(++counter).padStart(4, '0')}`,
                capabilityId: inferCapabilityId(relativePath),
                functionName: extractTargetFunction(relativePath),
                filePath: relativePath,
                strategy: hasFastCheckImport ? 'both' : 'valid_only',
                inputCount: deriveZeroValue(),
                failures: executionResult.failures,
                status: executionResult.status as PropertyTestStatus,
                counterexamples: executionResult.counterexample
                  ? [executionResult.counterexample]
                  : [],
                durationMs: executionResult.durationMs,
              });
            }

            if (testCount === 0) {
              results.push({
                testId: `prop-${String(++counter).padStart(4, '0')}`,
                capabilityId: inferCapabilityId(relativePath),
                functionName: extractTargetFunction(relativePath),
                filePath: relativePath,
                strategy: hasFastCheckImport ? 'both' : 'valid_only',
                inputCount: deriveZeroValue(),
                failures: executionResult.failures,
                status: executionResult.status as PropertyTestStatus,
                counterexamples: executionResult.counterexample
                  ? [executionResult.counterexample]
                  : [],
                durationMs: executionResult.durationMs,
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  scanDir(rootDir);
  return results;
}

export function executePropertyTestFile(
  rootDir: string,
  relativePath: string,
): PropertyExecutionResult {
  let runner = resolvePropertyRunner(rootDir, relativePath);
  if (!runner) {
    return {
      status: 'not_executed',
      failures: 0,
      durationMs: 0,
      counterexample: null,
    };
  }

  let startedAt = Date.now();

  try {
    execFileSync(runner.command, runner.args, {
      cwd: runner.cwd,
      encoding: du8(),
      stdio: 'pipe',
      timeout: 120000,
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
      },
    });

    return {
      status: 'passed',
      failures: 0,
      durationMs: Date.now() - startedAt,
      counterexample: null,
    };
  } catch (error) {
    return {
      status: 'failed',
      failures: 1,
      durationMs: Date.now() - startedAt,
      counterexample: {
        input: relativePath,
        expected: 'property test runner exits with code 0',
        actual: extractProcessFailure(error),
      },
    };
  }
}

export function resolvePropertyRunner(
  rootDir: string,
  relativePath: string,
): { command: string; args: string[]; cwd: string } | null {
  let absolutePath = path.join(rootDir, relativePath);
  let rootVitest = path.join(rootDir, 'node_modules', '.bin', 'vitest');
  if (fs.existsSync(rootVitest)) {
    return {
      command: rootVitest,
      args: ['run', absolutePath],
      cwd: rootDir,
    };
  }

  if (relativePath.startsWith(`backend${path.sep}`) || relativePath.startsWith('backend/')) {
    let backendJest = path.join(rootDir, 'backend', 'node_modules', '.bin', 'jest');
    if (fs.existsSync(backendJest)) {
      return {
        command: backendJest,
        args: ['--runInBand', '--findRelatedTests', absolutePath],
        cwd: path.join(rootDir, 'backend'),
      };
    }
  }

  return null;
}

export function extractProcessFailure(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'unknown runner failure';
  }

  let output = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  let parts = [output.stdout, output.stderr, output.message]
    .filter((part): part is string => isStringEvidence(part) && part.trim().length > 0)
    .map((part) => part.trim());

  let text = collapseWhitespace(parts.join('\n')).slice(0, 500);
  return text || 'property test runner exited with a non-zero status';
}

export function collapseWhitespace(value: string): string {
  return splitWhitespace(value).join(' ');
}

export function stripKnownTestSourceSuffix(filePath: string): string {
  let parsed = path.parse(filePath);
  let name = parsed.name;
  let suffixes = splitKnownTestSourceSuffixesFromObservedName(name);
  while (suffixes.length > 0) {
    let suffix = suffixes.shift();
    if (suffix && name.endsWith(suffix)) {
      name = name.slice(0, name.length - suffix.length);
      suffixes = splitKnownTestSourceSuffixesFromObservedName(name);
    }
  }
  return path.join(parsed.dir, `${name}${parsed.ext}`);
}

export function splitKnownTestSourceSuffixesFromObservedName(name: string): string[] {
  return name
    .split('.')
    .slice(Number(Boolean(name)))
    .map((part) => `.${part}`)
    .filter((part) => part.length > Number(Boolean(part)));
}

export function countPropertyTestsInContent(content: string): number {
  let tally = deriveZeroValue();
  let re = new RegExp(PROPERTY_ASSERTION_SENSOR.source, 'g');
  while (re.exec(content) !== null) {
    tally += deriveUnitValue();
  }
  return tally;
}

export function inferCapabilityId(filePath: string): string {
  let segments = stripKnownTestSourceSuffix(filePath).split(path.sep);

  let meaningful = segments.filter(
    (s) => s && s !== 'src' && s !== 'tests' && s !== '__tests__' && s !== 'test' && s !== 'spec',
  );

  let capabilityLimit =
    deriveHttpStatusFromObservedCatalog('OK') /
    (STATUS_CODES[deriveHttpStatusFromObservedCatalog('Forbidden')]?.length ?? deriveUnitValue());
  return meaningful.join('-').slice(deriveZeroValue(), capabilityLimit) || unknownCapabilityId();
}

export function extractTargetFunction(filePath: string): string {
  return stripKnownTestSourceSuffix(path.basename(filePath))
    .split('.property')
    .join('')
    .split('.prop')
    .join('');
}

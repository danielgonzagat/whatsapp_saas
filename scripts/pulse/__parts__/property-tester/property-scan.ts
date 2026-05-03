import * as path from 'path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { PropertyTestCase } from '../../types.property-tester';
import type { PropertyExecutionResult } from './types';
import { readDir } from '../../safe-fs';
import {
  du8,
  shouldScanDirectory,
  isSourceFileName,
  isTestLikeFile,
  hasFastCheckImportEvidence,
  hasPropertyEvidence,
  countPropertyTestsInContent,
  inferCapabilityId,
  extractTargetFunction,
  zeroValue,
  unitValue,
  isStringEvidence,
  splitWhitespace,
  collapseWhitespace,
} from './util';

export function scanForExistingPropertyTests(rootDir: string): PropertyTestCase[] {
  let results: PropertyTestCase[] = [];
  let counter = 0;

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
                inputCount: zeroValue(),
                failures: executionResult.failures,
                status: executionResult.status,
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
                inputCount: zeroValue(),
                failures: executionResult.failures,
                status: executionResult.status,
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

function executePropertyTestFile(rootDir: string, relativePath: string): PropertyExecutionResult {
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

function resolvePropertyRunner(
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

function extractProcessFailure(error: unknown): string {
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

export function generatePropertyTestTargets(_behaviorGraph?: unknown): PropertyTestCase[] {
  void _behaviorGraph;
  return [];
}

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';

// Only run in DEEP/TOTAL mode — check for env var
// Usage: PULSE_DEEP=1 npx ts-node scripts/pulse/index.ts

const JEST_TIMEOUT_MS = 120_000;

interface JestTestResult {
  status: 'passed' | 'failed' | 'pending' | 'todo' | 'skipped';
  fullName: string;
  failureMessages: string[];
  ancestorTitles: string[];
  title: string;
}

interface JestSuiteResult {
  testFilePath: string;
  status: 'passed' | 'failed';
  testResults: JestTestResult[];
  failureMessage?: string;
}

interface JestJsonOutput {
  testResults: JestSuiteResult[];
  success: boolean;
  numFailedTests: number;
}

function hasJest(dir: string): boolean {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    // Check devDependencies and dependencies for jest
    const allDeps: Record<string, unknown> = {
      ...(pkg.dependencies as Record<string, unknown> || {}),
      ...(pkg.devDependencies as Record<string, unknown> || {}),
    };
    return 'jest' in allDeps;
  } catch {
    return false;
  }
}

function hasTestFiles(dir: string): boolean {
  // Quick check: look for any *.spec.ts or *.test.ts files
  const testSrc = path.join(dir, 'src');
  const testDir = path.join(dir, 'test');
  const srcExists = fs.existsSync(testSrc) || fs.existsSync(testDir);
  if (!srcExists) return false;

  function checkDir(d: string, depth = 0): boolean {
    if (depth > 5) return false;
    if (!fs.existsSync(d)) return false;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
      if (entry.isFile() && /\.(spec|test)\.(ts|js)$/.test(entry.name)) return true;
      if (entry.isDirectory() && checkDir(path.join(d, entry.name), depth + 1)) return true;
    }
    return false;
  }

  return checkDir(dir);
}

function runJest(projectDir: string, rootDir: string, label: string): Break[] {
  if (!hasJest(projectDir)) return [];
  if (!hasTestFiles(projectDir)) return [];

  let output: string;
  try {
    output = execSync('npx jest --forceExit --no-coverage --json', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: JEST_TIMEOUT_MS,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    // Jest exits with code 1 on test failures; stdout still contains JSON
    output = e.stdout || '';
    if (!output.trim()) {
      // Jest not runnable (e.g. config error)
      return [];
    }
  }

  // Parse JSON output
  let result: JestJsonOutput;
  try {
    result = JSON.parse(output) as JestJsonOutput;
  } catch {
    // Not valid JSON — jest may have printed something else
    return [];
  }

  if (!result || !Array.isArray(result.testResults)) return [];

  const breaks: Break[] = [];

  for (const suite of result.testResults) {
    const relFile = path.relative(rootDir, suite.testFilePath);

    for (const test of suite.testResults) {
      if (test.status !== 'failed') continue;

      // Extract a short error message from failureMessages
      const rawFailure = (test.failureMessages || []).join('\n');
      // Take first non-empty line that isn't a stack trace line
      const firstMeaningfulLine = rawFailure
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('at ') && !l.startsWith('●'))
        .slice(0, 1)
        .join('');

      const testName = [
        ...test.ancestorTitles,
        test.title,
      ].filter(Boolean).join(' > ');

      breaks.push({
        type: 'TEST_FAILURE',
        severity: 'critical',
        file: relFile,
        line: 1,
        description: `${label} test failed: ${testName}`,
        detail: (firstMeaningfulLine || rawFailure.slice(0, 200)).slice(0, 200),
      });
    }

    // Handle suite-level failures (e.g. compilation error in test file)
    if (suite.status === 'failed' && suite.testResults.length === 0 && suite.failureMessage) {
      const firstLine = suite.failureMessage.split('\n').find(l => l.trim()) || '';
      breaks.push({
        type: 'TEST_FAILURE',
        severity: 'critical',
        file: relFile,
        line: 1,
        description: `${label} test suite failed to run`,
        detail: firstLine.trim().slice(0, 200),
      });
    }
  }

  return breaks;
}

export function checkTests(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) return [];

  const breaks: Break[] = [];

  // Backend — NestJS uses jest
  const backendDir = path.dirname(config.backendDir); // backend/ not backend/src
  breaks.push(...runJest(backendDir, config.rootDir, 'Backend'));

  // Worker — uses vitest (not jest), skip gracefully
  // If worker ever switches to jest, hasJest() will pick it up automatically
  const workerDir = config.workerDir;
  breaks.push(...runJest(workerDir, config.rootDir, 'Worker'));

  return breaks;
}

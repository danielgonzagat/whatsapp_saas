import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';

// Only run in DEEP/TOTAL mode — check for env var
// Usage: PULSE_DEEP=1 npx ts-node scripts/pulse/index.ts

const ESLINT_TIMEOUT_MS = 60_000;
const MAX_ERRORS_PER_PROJECT = 50;

// ESLint severity: 1 = warning, 2 = error
const ESLINT_ERROR_SEVERITY = 2;

interface ESLintMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

interface ESLintFileResult {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
}

function hasESLint(dir: string): boolean {
  // Check package.json for eslint dependency
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return false;
  }
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const allDeps: Record<string, unknown> = {
      ...((pkg.dependencies as Record<string, unknown>) || {}),
      ...((pkg.devDependencies as Record<string, unknown>) || {}),
    };
    return 'eslint' in allDeps;
  } catch {
    return false;
  }
}

function hasSrcDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'src'));
}

function runESLint(projectDir: string, rootDir: string, label: string): Break[] {
  if (!hasESLint(projectDir)) {
    return [];
  }
  if (!hasSrcDir(projectDir)) {
    return [];
  }

  let output: string;
  try {
    output = execSync('npx eslint src/ --format json --max-warnings 999', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: ESLINT_TIMEOUT_MS,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    // ESLint exits with code 1 when there are lint errors; stdout has JSON
    output = e.stdout || '';
    if (!output.trim()) {
      // ESLint not runnable or no JSON output
      return [];
    }
  }

  // Parse JSON
  let results: ESLintFileResult[];
  try {
    results = JSON.parse(output) as ESLintFileResult[];
  } catch {
    return [];
  }

  if (!Array.isArray(results)) {
    return [];
  }

  const breaks: Break[] = [];

  for (const fileResult of results) {
    if (breaks.length >= MAX_ERRORS_PER_PROJECT) {
      break;
    }

    const relFile = path.relative(rootDir, fileResult.filePath);

    // Only emit breaks for severity=2 (errors), not warnings
    const errors = fileResult.messages.filter((m) => m.severity === ESLINT_ERROR_SEVERITY);

    for (const msg of errors) {
      if (breaks.length >= MAX_ERRORS_PER_PROJECT) {
        break;
      }

      const ruleLabel = msg.ruleId ? ` (${msg.ruleId})` : '';
      breaks.push({
        type: 'LINT_VIOLATION',
        severity: 'low',
        file: relFile,
        line: msg.line || 1,
        description: `${label} ESLint error${ruleLabel}`,
        detail: msg.message.slice(0, 200),
      });
    }
  }

  return breaks;
}

export function checkLint(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];

  // Frontend (Next.js) — run from frontend/ directory (parent of frontend/src)
  const frontendRoot = path.dirname(config.frontendDir);
  breaks.push(...runESLint(frontendRoot, config.rootDir, 'Frontend'));

  // Backend (NestJS) — run from backend/ directory
  const backendRoot = path.dirname(config.backendDir);
  breaks.push(...runESLint(backendRoot, config.rootDir, 'Backend'));

  return breaks;
}

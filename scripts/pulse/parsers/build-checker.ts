import { execSync } from 'child_process';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';

// Only run in DEEP/TOTAL mode — check for env var
// Usage: PULSE_DEEP=1 npx ts-node scripts/pulse/index.ts

interface ProjectTarget {
  dir: string;
  breakType: 'BUILD_FRONTEND_FAILS' | 'BUILD_BACKEND_FAILS' | 'BUILD_WORKER_FAILS';
  label: string;
}

// TypeScript error line pattern: filename(line,col): error TSdddd: message
// Also handles: filename:line:col - error TSdddd: message (alt format)
const TS_ERROR_RE = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/;
const TS_ERROR_ALT_RE = /^(.+?):(\d+):\d+\s+-\s+error (TS\d+): (.+)$/;

const MAX_ERRORS_PER_PROJECT = 20;
const TSC_TIMEOUT_MS = 60_000;

function parseTscOutput(
  stderr: string,
  projectDir: string,
  rootDir: string,
  breakType: 'BUILD_FRONTEND_FAILS' | 'BUILD_BACKEND_FAILS' | 'BUILD_WORKER_FAILS',
  label: string,
): Break[] {
  const breaks: Break[] = [];
  const lines = stderr.split('\n');

  for (const raw of lines) {
    if (breaks.length >= MAX_ERRORS_PER_PROJECT) {
      break;
    }

    const line = raw.trim();
    if (!line) {
      continue;
    }

    let match = TS_ERROR_RE.exec(line) || TS_ERROR_ALT_RE.exec(line);
    if (!match) {
      continue;
    }

    const [, filePath, lineNum, code, message] = match;

    // Resolve file path relative to root
    const absFile = path.isAbsolute(filePath) ? filePath : path.resolve(projectDir, filePath);
    const relFile = path.relative(rootDir, absFile);

    breaks.push({
      type: breakType,
      severity: 'critical',
      file: relFile,
      line: parseInt(lineNum, 10) || 1,
      description: `${label} TypeScript compile error: ${code}`,
      detail: message.trim().slice(0, 200),
    });
  }

  return breaks;
}

function runTsc(
  projectDir: string,
  rootDir: string,
  breakType: 'BUILD_FRONTEND_FAILS' | 'BUILD_BACKEND_FAILS' | 'BUILD_WORKER_FAILS',
  label: string,
): Break[] {
  try {
    execSync('npx tsc --noEmit', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: TSC_TIMEOUT_MS,
    });
    // No error → clean build
    return [];
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };

    // tsc writes errors to stdout (not stderr) for --noEmit
    const output = (e.stderr || '') + (e.stdout || '');
    if (!output.trim()) {
      // Execution failed but no parseable output (e.g. tsc not installed)
      return [];
    }

    const parsed = parseTscOutput(output, projectDir, rootDir, breakType, label);

    // If we couldn't parse individual errors but tsc failed, emit one generic break
    if (parsed.length === 0) {
      return [
        {
          type: breakType,
          severity: 'critical',
          file: path.relative(rootDir, projectDir),
          line: 1,
          description: `${label} TypeScript compilation failed`,
          detail: output.split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 200),
        },
      ];
    }

    return parsed;
  }
}

/** Check builds. */
export function checkBuilds(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const targets: ProjectTarget[] = [
    {
      dir: path.dirname(config.frontendDir), // frontend/ (not frontend/src)
      breakType: 'BUILD_FRONTEND_FAILS',
      label: 'Frontend',
    },
    {
      dir: path.dirname(config.backendDir), // backend/ (not backend/src)
      breakType: 'BUILD_BACKEND_FAILS',
      label: 'Backend',
    },
    {
      dir: config.workerDir,
      breakType: 'BUILD_WORKER_FAILS',
      label: 'Worker',
    },
  ];

  const breaks: Break[] = [];

  for (const target of targets) {
    const result = runTsc(target.dir, config.rootDir, target.breakType, target.label);
    breaks.push(...result);
  }

  return breaks;
}

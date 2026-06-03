import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..', '..');

export function safeRepoPath(...segments: string[]): string {
  const resolved = path.resolve(ROOT_DIR, ...segments);
  const boundary = ROOT_DIR + path.sep;
  if (resolved !== ROOT_DIR && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside repo root`);
  }
  return resolved;
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export function readJsonOptional<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return readJson<T>(filePath);
}

export interface RuntimeCheckResult {
  pass: boolean;
  label: string;
  detail: string;
}

export interface RuntimeChecks {
  build: RuntimeCheckResult;
  ciLastRun: RuntimeCheckResult;
  gitStatus: RuntimeCheckResult;
  testCoverage: RuntimeCheckResult;
  envFiles: RuntimeCheckResult;
  hooksIntegrity: RuntimeCheckResult;
}

export function checkBuildStatus(): RuntimeCheckResult {
  const backendDist = safeRepoPath('backend', 'dist');
  const frontendNext = safeRepoPath('frontend', '.next');
  const workerDist = safeRepoPath('worker', 'dist');
  const backendOk = existsSync(backendDist);
  const frontendOk = existsSync(frontendNext);
  const workerOk = existsSync(workerDist);
  const allOk = backendOk && frontendOk && workerOk;
  const missing: string[] = [];
  if (!backendOk) missing.push('backend/dist');
  if (!frontendOk) missing.push('frontend/.next');
  if (!workerOk) missing.push('worker/dist');
  return {
    pass: allOk,
    label: 'Build artifacts exist',
    detail: allOk
      ? 'backend/dist, frontend/.next, worker/dist all present'
      : `Missing: ${missing.join(', ')}`,
  };
}

export function checkCiLastRun(): RuntimeCheckResult {
  try {
    const log = execSync('git log --oneline -20', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 5000,
    });
    const lines = log.trim().split('\n').filter(Boolean);
    const ciRelated = lines.filter(
      (l) =>
        l.includes('ci') ||
        l.includes('CI') ||
        l.includes('fix(build)') ||
        l.includes('fix(typecheck)'),
    );
    if (ciRelated.length > 0) {
      return {
        pass: false,
        label: 'Recent CI-related commits found',
        detail: `${ciRelated.length} CI-related commit(s) in last 20: ${ciRelated[0].substring(0, 72)}`,
      };
    }
    return {
      pass: true,
      label: 'No recent CI-related fix commits',
      detail: `Last 20 commits show no CI/build breakage patterns`,
    };
  } catch {
    return { pass: false, label: 'CI status unknown', detail: 'Could not read git log' };
  }
}

export function checkGitStatus(): RuntimeCheckResult {
  try {
    const status = execSync('git status --porcelain', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 5000,
    });
    const lines = status.trim().split('\n').filter(Boolean);
    const untracked = lines.filter((l) => l.startsWith('??')).length;
    const modified = lines.length - untracked;
    if (lines.length === 0) {
      return { pass: true, label: 'Working tree clean', detail: 'No uncommitted changes' };
    }
    return {
      pass: false,
      label: 'Working tree dirty',
      detail: `${modified} modified/deleted, ${untracked} untracked file(s)`,
    };
  } catch {
    return { pass: false, label: 'Git status unknown', detail: 'Could not read git status' };
  }
}

export function checkTestCoverage(): RuntimeCheckResult {
  const coveragePaths = [
    safeRepoPath('backend', 'coverage', 'coverage-summary.json'),
    safeRepoPath('frontend', 'coverage', 'coverage-summary.json'),
    safeRepoPath('worker', 'coverage', 'coverage-summary.json'),
  ];
  const found = coveragePaths.filter((p) => existsSync(p));
  if (found.length === 0) {
    return {
      pass: false,
      label: 'Test coverage unavailable',
      detail: 'No coverage-summary.json found in backend, frontend, or worker',
    };
  }
  try {
    const totals: number[] = [];
    for (const covPath of found) {
      const cov = readJson<{ total?: { lines?: { pct?: number } } }>(covPath);
      if (cov.total?.lines?.pct !== undefined) {
        totals.push(cov.total.lines.pct);
      }
    }
    if (totals.length === 0) {
      return {
        pass: false,
        label: 'Coverage data incomplete',
        detail: 'Found coverage files but no line percentage data',
      };
    }
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const pass = avg >= 60;
    return {
      pass,
      label: `Coverage ${pass ? 'adequate' : 'below threshold'}`,
      detail: `${totals.length} package(s) with coverage, average ${avg.toFixed(1)}% lines`,
    };
  } catch {
    return {
      pass: false,
      label: 'Coverage parse error',
      detail: 'Could not parse coverage summary files',
    };
  }
}

export function checkEnvFiles(): RuntimeCheckResult {
  const envExample = safeRepoPath('.env.example');
  const backendEnv = safeRepoPath('backend', '.env.example');
  const frontendEnv = safeRepoPath('frontend', '.env.example');
  const allOk = existsSync(envExample) && existsSync(backendEnv) && existsSync(frontendEnv);
  const missing: string[] = [];
  if (!existsSync(envExample)) missing.push('.env.example');
  if (!existsSync(backendEnv)) missing.push('backend/.env.example');
  if (!existsSync(frontendEnv)) missing.push('frontend/.env.example');
  return {
    pass: allOk,
    label: 'Environment file templates exist',
    detail: allOk ? 'All .env.example files present' : `Missing: ${missing.join(', ')}`,
  };
}

export function checkHooksIntegrity(): RuntimeCheckResult {
  const prePush = safeRepoPath('.husky', 'pre-push');
  const preCommit = safeRepoPath('.husky', 'pre-commit');
  const commitMsg = safeRepoPath('.husky', 'commit-msg');
  const allOk = existsSync(prePush) && existsSync(preCommit) && existsSync(commitMsg);
  const missing: string[] = [];
  if (!existsSync(prePush)) missing.push('.husky/pre-push');
  if (!existsSync(preCommit)) missing.push('.husky/pre-commit');
  if (!existsSync(commitMsg)) missing.push('.husky/commit-msg');
  return {
    pass: allOk,
    label: 'Git hooks integrity',
    detail: allOk ? 'All Husky hooks present' : `Missing: ${missing.join(', ')}`,
  };
}

export function runAllRuntimeChecks(): RuntimeChecks {
  return {
    build: checkBuildStatus(),
    ciLastRun: checkCiLastRun(),
    gitStatus: checkGitStatus(),
    testCoverage: checkTestCoverage(),
    envFiles: checkEnvFiles(),
    hooksIntegrity: checkHooksIntegrity(),
  };
}

import { safeJoin, safeResolve } from '../safe-path';
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';

// ===== Helpers =====

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Parses a semver-ish version string and returns the major version number.
 * Handles "^4.0.0", "~4", "4.x", ">=4.0.0" etc.
 * Returns null if unparseable.
 */
function parseMajor(version: string): number | null {
  if (!version || typeof version !== 'string') {
    return null;
  }
  const stripped = version.replace(/^[\^~>=<v]+/, '').trim();
  const parts = stripped.split('.');
  const major = parseInt(parts[0], 10);
  return isNaN(major) ? null : major;
}

function extractDeps(pkg: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const section = pkg[key];
    if (section && typeof section === 'object') {
      for (const [name, ver] of Object.entries(section as Record<string, string>)) {
        if (!out[name]) {
          out[name] = ver as string;
        }
      }
    }
  }
  return out;
}

// Shared deps we care about for version conflict detection
const MONITORED_DEPS = new Set([
  'typescript',
  'zod',
  'class-validator',
  'class-transformer',
  'bullmq',
  'ioredis',
  'prisma',
  '@prisma/client',
]);

/** Check infra config. */
export function checkInfraConfig(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ===== 1. .dockerignore check =====
  const dockerignorePath = safeJoin(config.rootDir, '.dockerignore');
  if (!fs.existsSync(dockerignorePath)) {
    breaks.push({
      type: 'DOCKER_MISSING_IGNORE',
      severity: 'medium',
      file: '.dockerignore',
      line: 1,
      description: '.dockerignore is missing at the repository root',
      detail:
        'Without .dockerignore, node_modules and sensitive files may be included in the Docker build context.',
    });
  }

  // ===== 2. Dockerfile multistage check =====
  const dockerfilePaths = [
    safeJoin(config.backendDir, 'Dockerfile'),
    safeJoin(config.frontendDir, 'Dockerfile'),
    safeJoin(config.workerDir, 'Dockerfile'),
  ];

  const MULTISTAGE_RE = /^FROM\s+\S+\s+AS\s+\S+/im;

  for (const dfPath of dockerfilePaths) {
    if (!fs.existsSync(dfPath)) {
      continue;
    }

    const content = readFileSafe(dfPath);
    if (content === null) {
      continue;
    }

    if (!MULTISTAGE_RE.test(content)) {
      const relFile = path.relative(config.rootDir, dfPath);
      breaks.push({
        type: 'DOCKER_NO_MULTISTAGE',
        severity: 'low',
        file: relFile,
        line: 1,
        description: `Dockerfile does not use multi-stage build: ${relFile}`,
        detail:
          'Add a builder stage (FROM ... AS builder) and a lean runtime stage to reduce final image size.',
      });
    }
  }

  // ===== 3. TypeScript version conflict across packages =====
  const packageJsonPaths: { label: string; filePath: string }[] = [
    { label: 'frontend', filePath: safeJoin(config.frontendDir, 'package.json') },
    { label: 'backend', filePath: safeJoin(config.backendDir, 'package.json') },
    { label: 'worker', filePath: safeJoin(config.workerDir, 'package.json') },
  ];

  // Collect dep → { label, version, major } per package
  const depMap = new Map<string, Array<{ label: string; version: string; major: number }>>();

  for (const { label, filePath } of packageJsonPaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const pkg = readJsonSafe(filePath);
    if (!pkg) {
      continue;
    }

    const allDeps = extractDeps(pkg);
    for (const depName of MONITORED_DEPS) {
      const version = allDeps[depName];
      if (!version) {
        continue;
      }

      const major = parseMajor(version);
      if (major === null) {
        continue;
      }

      if (!depMap.has(depName)) {
        depMap.set(depName, []);
      }
      depMap.get(depName)!.push({ label, version, major });
    }
  }

  for (const [depName, entries] of depMap.entries()) {
    if (entries.length < 2) {
      continue;
    }

    const majors = new Set(entries.map((e) => e.major));
    if (majors.size > 1) {
      const detail = entries.map((e) => `${e.label}: ${e.version}`).join(', ');
      // Use the first package's path as file reference
      const firstEntry = packageJsonPaths.find((p) => p.label === entries[0].label);
      breaks.push({
        type: 'PACKAGE_VERSION_CONFLICT',
        severity: 'medium',
        file: firstEntry ? path.relative(config.rootDir, firstEntry.filePath) : 'package.json',
        line: 1,
        description: `Major version conflict for "${depName}" across packages`,
        detail: detail,
      });
    }
  }

  return breaks;
}

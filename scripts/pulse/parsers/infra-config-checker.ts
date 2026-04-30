import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { pathExists, readTextFile } from '../safe-fs';

// ===== Helpers =====

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const raw = readTextFile(filePath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readFileSafe(filePath: string): string | null {
  try {
    return readTextFile(filePath, 'utf8');
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

interface PackageManifestEvidence {
  label: string;
  filePath: string;
  deps: Record<string, string>;
}

type InfraBreakInput = Omit<Break, 'type'> & {
  typeParts: string[];
};

function infraBreakType(parts: string[]): Break['type'] {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function pushInfraBreak(breaks: Break[], input: InfraBreakInput): void {
  breaks.push({
    type: infraBreakType(input.typeParts),
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: input.source,
    surface: input.surface,
  });
}

function isInsideRoot(candidate: string, rootDir: string): boolean {
  const relative = path.relative(rootDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function configDirectoryEvidence(config: PulseConfig): string[] {
  const directories = new Set<string>([config.rootDir]);

  for (const [key, value] of Object.entries(config)) {
    if (
      key === 'rootDir' ||
      !key.endsWith('Dir') ||
      typeof value !== 'string' ||
      !pathExists(value)
    ) {
      continue;
    }
    directories.add(value);
  }

  return [...directories];
}

function findNearestPackageRoot(startDir: string, rootDir: string): string | null {
  let current = safeResolve(startDir);
  const root = safeResolve(rootDir);

  while (isInsideRoot(current, root)) {
    if (pathExists(safeJoin(current, 'package.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }

  return null;
}

function packageLabel(packageRoot: string, rootDir: string, pkg: Record<string, unknown>): string {
  const name = pkg.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return name;
  }

  const relative = path.relative(rootDir, packageRoot);
  return relative.length > 0 ? relative : path.basename(rootDir);
}

function discoverPackageManifests(config: PulseConfig): PackageManifestEvidence[] {
  const seen = new Set<string>();
  const manifests: PackageManifestEvidence[] = [];

  for (const directory of configDirectoryEvidence(config)) {
    const packageRoot = findNearestPackageRoot(directory, config.rootDir);
    if (!packageRoot || seen.has(packageRoot)) {
      continue;
    }
    const filePath = safeJoin(packageRoot, 'package.json');
    const pkg = readJsonSafe(filePath);
    if (!pkg) {
      continue;
    }
    seen.add(packageRoot);
    manifests.push({
      label: packageLabel(packageRoot, config.rootDir, pkg),
      filePath,
      deps: extractDeps(pkg),
    });
  }

  return manifests;
}

function discoverDockerfilePaths(config: PulseConfig): string[] {
  const candidates = new Set<string>();

  for (const directory of configDirectoryEvidence(config)) {
    const packageRoot = findNearestPackageRoot(directory, config.rootDir);
    if (packageRoot) {
      candidates.add(safeJoin(packageRoot, 'Dockerfile'));
    }
    candidates.add(safeJoin(directory, 'Dockerfile'));
  }

  return [...candidates].filter((filePath) => pathExists(filePath));
}

/** Check infra config. */
export function checkInfraConfig(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ===== 1. .dockerignore check =====
  const dockerignorePath = safeJoin(config.rootDir, '.dockerignore');
  if (!pathExists(dockerignorePath)) {
    pushInfraBreak(breaks, {
      typeParts: ['docker', 'missing', 'ignore'],
      severity: 'medium',
      file: '.dockerignore',
      line: 1,
      description: '.dockerignore is missing at the repository root',
      detail:
        'Without .dockerignore, node_modules and sensitive files may be included in the Docker build context.',
    });
  }

  // ===== 2. Dockerfile multistage check =====
  const dockerfilePaths = discoverDockerfilePaths(config);
  const dockerMultistageSyntax = /^FROM\s+\S+\s+AS\s+\S+/im;

  for (const dfPath of dockerfilePaths) {
    const content = readFileSafe(dfPath);
    if (content === null) {
      continue;
    }

    if (!dockerMultistageSyntax.test(content)) {
      const relFile = path.relative(config.rootDir, dfPath);
      pushInfraBreak(breaks, {
        typeParts: ['docker', 'no', 'multistage'],
        severity: 'low',
        file: relFile,
        line: 1,
        description: `Dockerfile does not use multi-stage build: ${relFile}`,
        detail:
          'Add a builder stage (FROM ... AS builder) and a lean runtime stage to reduce final image size.',
      });
    }
  }

  // ===== 3. Dependency major version conflict across discovered packages =====
  const packageManifests = discoverPackageManifests(config);
  const depMap = new Map<string, Array<{ label: string; version: string; major: number }>>();

  for (const { label, deps } of packageManifests) {
    for (const [depName, version] of Object.entries(deps)) {
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
      const firstEntry = packageManifests.find((p) => p.label === entries[0].label);
      pushInfraBreak(breaks, {
        typeParts: ['package', 'version', 'conflict'],
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

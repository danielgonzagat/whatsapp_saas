import * as path from 'node:path';
import { pathExists, readDir, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import type {
  PulseDiscoveredCommand,
  PulseCommandPurpose,
  CandidateSource,
  PackageJson,
} from './types';
import { IGNORED_DIRS, PACKAGE_DIR_ALLOWLIST, normalizeRepoPath, uniqueSorted } from './types';

export function classifyCommand(
  scriptName: string | null,
  command: string,
): {
  purpose: PulseCommandPurpose;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
} {
  const loweredName = (scriptName ?? '').toLowerCase();
  const loweredCommand = command.toLowerCase();
  const signals: string[] = [];

  if (loweredName.includes('pulse') || /scripts\/pulse\/run[.]js/.test(loweredCommand)) {
    signals.push('pulse');
    return { purpose: 'pulse', confidence: 'high', signals };
  }
  if (
    loweredName === 'build' ||
    loweredName.endsWith(':build') ||
    /\bnpm run build\b/.test(loweredCommand)
  ) {
    signals.push('build');
    return { purpose: 'build', confidence: 'high', signals };
  }
  if (
    loweredName === 'test' ||
    loweredName.includes(':test') ||
    /\b(vitest|jest|playwright test)\b/.test(loweredCommand)
  ) {
    signals.push('test');
    return { purpose: 'test', confidence: 'high', signals };
  }
  if (
    loweredName === 'dev' ||
    loweredName.includes(':dev') ||
    /\b(next dev|nest start --watch)\b/.test(loweredCommand)
  ) {
    signals.push('dev');
    return { purpose: 'dev', confidence: 'high', signals };
  }
  if (loweredName.includes('typecheck') || /\btsc\b/.test(loweredCommand)) {
    signals.push('typecheck');
    return { purpose: 'typecheck', confidence: 'high', signals };
  }
  if (loweredName.includes('lint') || /\beslint\b/.test(loweredCommand)) {
    signals.push('lint');
    return { purpose: 'lint', confidence: 'high', signals };
  }
  if (/\bnpm ci\b|\bnpm install\b/.test(loweredCommand)) {
    signals.push('install');
    return { purpose: 'install', confidence: 'medium', signals };
  }
  if (/\bdeploy\b|railway|vercel/.test(loweredCommand)) {
    signals.push('deploy');
    return { purpose: 'deploy', confidence: 'medium', signals };
  }
  return { purpose: 'other', confidence: 'low', signals };
}

export function discoverPackageJsonFiles(rootDir: string): string[] {
  const found: string[] = [];
  const visit = (relativeDir: string, depth: number): void => {
    if (depth > 3) {
      return;
    }
    const absoluteDir = safeJoin(rootDir, relativeDir);
    for (const entry of readDir(absoluteDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          visit(normalizeRepoPath(path.join(relativeDir, entry.name)), depth + 1);
        }
        continue;
      }
      if (entry.name !== 'package.json') {
        continue;
      }
      const packageDir = normalizeRepoPath(relativeDir || '.');
      if (PACKAGE_DIR_ALLOWLIST.has(packageDir)) {
        found.push(normalizeRepoPath(path.join(relativeDir, entry.name)));
      }
    }
  };
  visit('.', 0);
  return uniqueSorted(found);
}

export function discoverStaticSources(rootDir: string): CandidateSource[] {
  const packageJsonFiles = discoverPackageJsonFiles(rootDir).map((relativePath) => ({
    relativePath,
    sourceKind: 'package-json' as const,
  }));
  const sources: CandidateSource[] = [...packageJsonFiles];
  const visit = (relativeDir: string, depth: number): void => {
    if (depth > 3) {
      return;
    }
    const absoluteDir = safeJoin(rootDir, relativeDir);
    for (const entry of readDir(absoluteDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          visit(normalizeRepoPath(path.join(relativeDir, entry.name)), depth + 1);
        }
        continue;
      }
      const relativePath = normalizeRepoPath(path.join(relativeDir, entry.name));
      if (/^\.github\/workflows\/.+[.]ya?ml$/.test(relativePath)) {
        sources.push({ relativePath, sourceKind: 'github-workflow' });
      } else if (/Dockerfile/.test(entry.name)) {
        sources.push({ relativePath, sourceKind: 'dockerfile' });
      } else if (/tsconfig(?:[.][\w-]+)?[.]json$/.test(entry.name)) {
        sources.push({ relativePath, sourceKind: 'tsconfig' });
      }
    }
  };
  visit('.', 0);
  return sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readTextFile(filePath, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function packagePrefix(packageDir: string): string {
  return packageDir === '.' ? 'npm' : `npm --prefix ${packageDir}`;
}

export function inferInstallCommands(
  rootDir: string,
  packageJsonFiles: string[],
): PulseDiscoveredCommand[] {
  return packageJsonFiles.flatMap((relativePackagePath) => {
    const packageDir = normalizeRepoPath(path.dirname(relativePackagePath));
    const lockPath = normalizeRepoPath(path.join(packageDir, 'package-lock.json'));
    const absoluteLockPath = safeJoin(rootDir, lockPath);
    if (!pathExists(absoluteLockPath)) {
      return [];
    }
    const command = `${packagePrefix(packageDir)} ci`;
    return [
      {
        id: `install:${packageDir}`,
        purpose: 'install' as const,
        command,
        sourcePath: lockPath,
        sourceKind: 'lockfile' as const,
        packagePath: relativePackagePath,
        confidence: 'high' as const,
        signals: ['package-lock'],
      },
    ];
  });
}

export function inferScriptCommands(
  rootDir: string,
  packageJsonFiles: string[],
): PulseDiscoveredCommand[] {
  const commands: PulseDiscoveredCommand[] = [];
  for (const relativePackagePath of packageJsonFiles) {
    const absolutePackagePath = safeJoin(rootDir, relativePackagePath);
    const parsed = readJsonRecord(absolutePackagePath) as PackageJson | null;
    if (!parsed?.scripts || typeof parsed.scripts !== 'object') {
      continue;
    }
    const packageDir = normalizeRepoPath(path.dirname(relativePackagePath));
    for (const [scriptName, scriptCommand] of Object.entries(parsed.scripts)) {
      if (typeof scriptCommand !== 'string') {
        continue;
      }
      const classification = classifyCommand(scriptName, scriptCommand);
      const command = `${packagePrefix(packageDir)} run ${scriptName}`;
      commands.push({
        id: `script:${packageDir}:${scriptName}`,
        purpose: classification.purpose,
        command,
        sourcePath: relativePackagePath,
        sourceKind: 'package-json',
        packagePath: relativePackagePath,
        scriptName,
        confidence: classification.confidence,
        signals: classification.signals,
      });
    }
  }
  return commands;
}

export function inferTsconfigCommands(
  rootDir: string,
  sources: CandidateSource[],
): PulseDiscoveredCommand[] {
  return sources
    .filter((source) => source.sourceKind === 'tsconfig')
    .flatMap((source) => {
      const parsed = readJsonRecord(safeJoin(rootDir, source.relativePath));
      if (!parsed) {
        return [];
      }
      const packageDir = normalizeRepoPath(path.dirname(source.relativePath));
      const packagePath = normalizeRepoPath(path.join(packageDir, 'package.json'));
      if (!pathExists(safeJoin(rootDir, packagePath))) {
        return [];
      }
      return [
        {
          id: `tsconfig:${source.relativePath}`,
          purpose: 'typecheck' as const,
          command: `${packagePrefix(packageDir)} exec tsc --noEmit -p ${path.basename(source.relativePath)}`,
          sourcePath: source.relativePath,
          sourceKind: 'tsconfig' as const,
          packagePath,
          confidence: 'medium' as const,
          signals: ['tsconfig'],
        },
      ];
    });
}

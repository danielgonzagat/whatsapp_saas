import * as path from 'path';

import { readTextFile, readJsonFile, pathExists } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import type { ChaosProviderName } from './types';

export function readSafe(filePath: string): string {
  try {
    return readTextFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeEvidencePath(rootDir: string, filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : safeJoin(rootDir, filePath);
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

export function slugDependency(value: string): string | null {
  const slug = value
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replace(/[./]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug.length > 0 ? slug : null;
}

export function getNamedImportsFromModule(content: string, moduleName: string): string[] {
  const imports: string[] = [];
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(importRe)) {
    if (match[2] !== moduleName) {
      continue;
    }
    for (const rawName of match[1].split(',')) {
      const localName = rawName
        .split(/\s+as\s+/i)
        .pop()
        ?.trim();
      if (localName) {
        imports.push(localName);
      }
    }
  }
  return unique(imports);
}

export function hasDecoratorUse(content: string, decoratorName: string): boolean {
  return content.includes(`@${decoratorName}(`);
}

export function hasInternalRouteEvidence(content: string): boolean {
  return getNamedImportsFromModule(content, '@nestjs/common').some(
    (importedName) =>
      importedName.toLowerCase().includes('controller') && hasDecoratorUse(content, importedName),
  );
}

export function dependencyId(source: string, value: string): ChaosProviderName | null {
  const slug = slugDependency(value);
  return slug ? `${source}:${slug}` : null;
}

export function packageRoot(specifier: string): string | null {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('#')
  ) {
    return null;
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] || null;
}

export function envDependencyName(name: string): string | null {
  const upperName = name.toUpperCase();
  if (!/(?:^|_)(?:URL|URI|HOST|ENDPOINT|BASE_URL|API_KEY|SECRET|TOKEN)(?:_|$)/.test(upperName)) {
    return null;
  }
  const tokens = name
    .toLowerCase()
    .split('_')
    .filter((token) => token && !['api', 'key', 'secret', 'token', 'url', 'uri'].includes(token));
  return tokens.length > 0 ? tokens.join('-') : null;
}

export function addDetectedDependency(
  dependencies: Map<ChaosProviderName, string[]>,
  dependency: ChaosProviderName | null,
  filePath: string,
): void {
  if (!dependency) {
    return;
  }
  const files = dependencies.get(dependency) ?? [];
  files.push(filePath);
  dependencies.set(dependency, unique(files).sort());
}

export function compactBlastRadius(capabilityIds: string[]): string[] {
  const dynamicLimit = Math.max(1, Math.ceil(Math.sqrt(Math.max(capabilityIds.length, 1))));
  return unique(capabilityIds)
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
    .slice(0, dynamicLimit);
}

export function compactProviderDependencies(
  providers: Map<ChaosProviderName, string[]>,
): Map<ChaosProviderName, string[]> {
  const totalEvidenceFiles = [...providers.values()].reduce(
    (sum, files) => sum + Math.max(files.length, 1),
    0,
  );
  const dynamicLimit = Math.max(
    1,
    Math.ceil(Math.sqrt(Math.max(providers.size, 1) * Math.max(totalEvidenceFiles, 1))),
  );
  return new Map(
    [...providers.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .slice(0, dynamicLimit),
  );
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function loadArtifactRecords(
  rootDir: string,
  artifactName: string,
): Record<string, unknown>[] {
  const artifactPath = safeJoin(rootDir, '.pulse', 'current', artifactName);
  if (!pathExists(artifactPath)) {
    return [];
  }
  try {
    const payload = readJsonFile<Record<string, unknown>>(artifactPath);
    const records: Record<string, unknown>[] = [];
    for (const key of ['nodes', 'signals', 'capabilities']) {
      const value = payload[key];
      if (Array.isArray(value)) {
        records.push(
          ...value.filter(
            (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
          ),
        );
      }
    }
    return records;
  } catch {
    return [];
  }
}

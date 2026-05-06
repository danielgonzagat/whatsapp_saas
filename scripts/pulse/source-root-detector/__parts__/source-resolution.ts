import * as path from 'path';
import { pathExists, readDir } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import {
  SourceRootKind,
  SourceRootAvailability,
  SourceRootEvidenceBasis,
  DetectedSourceRoot,
  CONVENTIONAL_SOURCE_DIR_NAMES,
  sourceExtensionsSet,
  ZERO,
  ONE,
  SKIP_DIR_NAMES,
} from './types';
import {
  normalizeRelative,
  hasSkippedSegment,
  uniqueSorted,
  languagesForExtensions,
  inferFrameworksFromFileEvidence,
  inferKindFromFileEvidence,
  inferKind,
} from './helpers';

export function staticPrefixFromPattern(pattern: string): string | null {
  const normalized = normalizeRelative(pattern);
  if (!normalized || normalized.includes('..')) return null;
  const segments = normalized.split('/');
  const staticSegments: string[] = [];

  for (const segment of segments) {
    if (segment.includes('*') || segment.includes('{') || segment.includes('[')) break;
    staticSegments.push(segment);
  }

  if (staticSegments.length === ZERO) return null;
  const last = staticSegments[staticSegments.length - ONE];
  if (last && path.extname(last)) {
    staticSegments.pop();
  }
  if (staticSegments.length === ZERO) return null;
  return staticSegments.join('/');
}

export function sourceRootFromPatternEntry(relativeDir: string, entry: string): string | null {
  const prefix = staticPrefixFromPattern(entry);
  if (!prefix) return null;
  const sourceRoot = normalizeRelative(safeJoin(relativeDir, prefix));
  if (hasSkippedSegment(sourceRoot)) return null;
  return sourceRoot;
}

export function sourceRootFromPathEntry(relativeDir: string, entry: string): string | null {
  const normalizedEntry = normalizeRelative(entry.replace(/^\.\//, ''));
  if (!normalizedEntry || normalizedEntry.includes('..')) return null;
  const segments = normalizedEntry.split('/');
  const sourceIndex = segments.findIndex((segment) => CONVENTIONAL_SOURCE_DIR_NAMES.has(segment));
  if (sourceIndex < ZERO) return null;
  const sourceRoot = normalizeRelative(
    safeJoin(relativeDir, segments.slice(ZERO, sourceIndex + ONE).join('/')),
  );
  if (hasSkippedSegment(sourceRoot)) return null;
  return sourceRoot;
}

export function sourceRootFromEntrypoint(relativeDir: string, entrypoint: string): string | null {
  const normalizedEntrypoint = normalizeRelative(entrypoint.replace(/^\.\//, ''));
  if (!normalizedEntrypoint || normalizedEntrypoint.includes('..')) return null;
  if (!sourceExtensionsSet.has(path.extname(normalizedEntrypoint))) return null;
  const entryDir = path.dirname(normalizedEntrypoint);
  const packageDir = relativeDir || '.';
  const sourceRoot = normalizeRelative(safeJoin(packageDir, entryDir === '.' ? '.' : entryDir));
  if (!sourceRoot || hasSkippedSegment(sourceRoot)) return null;
  return sourceRoot;
}

export function sourceEntrypointsFromText(entry: string): string[] {
  const entrypoints: string[] = [];
  const sourceFilePattern =
    /(?:^|[\s"'`=:,(])((?:\.{1,2}\/)?[^\s"'`),;]+?\.(?:tsx?|jsx?))(?:$|[\s"'`),;:])/g;
  for (const match of entry.matchAll(sourceFilePattern)) {
    const candidate = normalizeRelative(match[1].replace(/^\.\//, ''));
    if (!candidate.includes('..') && sourceExtensionsSet.has(path.extname(candidate))) {
      entrypoints.push(candidate);
    }
  }
  return uniqueSorted(entrypoints);
}

export function stringValues(input: unknown): string[] {
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) return input.flatMap((value) => stringValues(value));
  if (input && typeof input === 'object') {
    return Object.values(input).flatMap((value) => stringValues(value));
  }
  return [];
}

export function packageManifestEntries(pkg: import('./types').PackageJson): string[] {
  const entries: string[] = [];
  for (const value of [pkg.main, pkg.module, pkg.types]) {
    if (typeof value === 'string') entries.push(value);
  }
  entries.push(...Object.values(pkg.scripts ?? {}));
  entries.push(...stringValues(pkg.exports));
  entries.push(...stringValues(pkg.imports));
  return entries;
}

export function entryMentionsSourceFile(entry: string): boolean {
  return [...sourceExtensionsSet].some((extension) => entry.includes(extension));
}

export function hasSourceFiles(rootDir: string, relativeDir: string): boolean {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return false;

  const entries = readDir(absoluteDir, { recursive: true }) as string[];
  return entries.some((entry) => {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) return false;
    return sourceExtensionsSet.has(path.extname(normalized));
  });
}

export function languageExtensionsFor(rootDir: string, relativeDir: string): string[] {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return [];

  const found = new Set<string>();
  for (const entry of readDir(absoluteDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) continue;
    const ext = path.extname(normalized);
    if (sourceExtensionsSet.has(ext)) found.add(ext);
  }
  return [...found].sort();
}

export function addRoot(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  relativePath: string,
  packageName: string | null,
  evidence: string,
  evidenceBasis: SourceRootEvidenceBasis,
  options: {
    weakCandidate?: boolean;
    kind?: SourceRootKind;
    frameworks?: string[];
    entrypoints?: string[];
  } = {},
): void {
  const normalized = normalizeRelative(relativePath);
  if (hasSkippedSegment(normalized)) return;
  const weakCandidate = options.weakCandidate === true;
  const hasFiles = hasSourceFiles(rootDir, normalized);
  if (!normalized || (!weakCandidate && !hasFiles)) return;
  const languageExtensions = languageExtensionsFor(rootDir, normalized);
  const availability: SourceRootAvailability =
    languageExtensions.length > ZERO ? 'inferred' : 'not_available';
  const unavailableReason =
    availability === 'not_available'
      ? 'source root exists but no scannable source files were found'
      : null;
  const kind = options.kind ?? inferKind(normalized, packageName);
  const fileEvidenceKind = inferKindFromFileEvidence(rootDir, normalized);
  const resolvedKind = kind === 'unknown' || kind === 'library' ? fileEvidenceKind : kind;
  const evidenceBasisList: SourceRootEvidenceBasis[] =
    fileEvidenceKind === 'unknown' ? [evidenceBasis] : [evidenceBasis, 'import-graph'];
  const frameworks = uniqueSorted([
    ...(options.frameworks ?? []),
    ...inferFrameworksFromFileEvidence(rootDir, normalized),
  ]);
  const entrypoints = uniqueSorted(
    (options.entrypoints ?? []).map((entrypoint) => normalizeRelative(entrypoint)),
  );
  const languages = languagesForExtensions(languageExtensions);

  const existing = roots.get(normalized);
  if (existing) {
    if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
    for (const basis of evidenceBasisList) {
      if (!existing.evidenceBasis.includes(basis)) existing.evidenceBasis.push(basis);
    }
    if (existing.kind === 'unknown' || existing.kind === 'library') {
      existing.kind = resolvedKind;
    }
    if (existing.availability === 'not_available' && availability === 'inferred') {
      existing.availability = 'inferred';
      existing.unavailableReason = null;
    }
    existing.languageExtensions = uniqueSorted([
      ...existing.languageExtensions,
      ...languageExtensions,
    ]);
    existing.languages = languagesForExtensions(existing.languageExtensions);
    existing.frameworks = uniqueSorted([...existing.frameworks, ...frameworks]);
    existing.entrypoints = uniqueSorted([...existing.entrypoints, ...entrypoints]);
    existing.weakCandidate = existing.weakCandidate && weakCandidate;
    return;
  }

  roots.set(normalized, {
    relativePath: normalized,
    absolutePath: path.resolve(rootDir, normalized),
    kind: resolvedKind,
    packageName,
    evidence: [evidence],
    evidenceBasis: evidenceBasisList,
    availability,
    unavailableReason,
    weakCandidate,
    languageExtensions,
    languages,
    frameworks,
    entrypoints,
  });
}

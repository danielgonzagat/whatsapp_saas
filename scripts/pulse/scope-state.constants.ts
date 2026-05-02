import * as path from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import type { PulseScopeSurface } from './types.truth.scope';
import { normalizePath } from './scope-state.codacy';
import { extractLocalFileReferences } from './dynamic-reality-grammar';

/**
 * Static lookup tables shared by `scope-state.ts`.
 *
 * Extracted from `scope-state.ts` to satisfy the 600-line architecture cap
 * on touched files. The exported values keep the same semantics they had
 * inline; consumers should treat these sets as read-only.
 */

/** File extensions that PULSE will scan during scope discovery. */
export const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.md',
  '.yml',
  '.yaml',
  '.json',
  '.css',
  '.scss',
]);

/** Directory names that PULSE never descends into. */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.pulse',
  '.claude',
  '.copilot',
  '.kilo',
  '.agents',
  '.serena',
  'dist',
  '.next',
  '.turbo',
  'build',
  'coverage',
  '.cache',
  '.vercel',
]);

/** Repository-root configuration files that PULSE always scans. */
export const ROOT_CONFIG_FILES = new Set([
  'package.json',
  'package-lock.json',
  '.dockerignore',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.tool-versions',
  'railpack-plan.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  'docker-compose.prod.yml',
  'docker-compose.test.yml',
  'biome.json',
  'codecov.yml',
  'commitlint.config.cjs',
  'knip.json',
  'release-please-config.json',
  'tslint.json',
]);

/**
 * Path segments that PULSE strips out when classifying a module candidate
 * from a file path. These are structural noise (folders that exist for
 * organisation rather than identity) and never represent a module.
 */
export const STRUCTURAL_NOISE_SEGMENTS = new Set([
  '',
  'src',
  'app',
  'apps',
  'pages',
  'page',
  'route',
  'routes',
  'api',
  'components',
  'component',
  'hooks',
  'hook',
  'lib',
  'libs',
  'utils',
  'util',
  'common',
  'shared',
  'module',
  'modules',
  'feature',
  'features',
  'provider',
  'providers',
  'context',
  'contexts',
  'types',
  'scripts',
  'docs',
  'prisma',
  'migrations',
  'generated',
  'tests',
  'test',
  'spec',
  'specs',
  '__tests__',
  'layout',
  'loading',
  'error',
  'template',
  'index',
]);

interface PackageJsonShape {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  main?: string;
  module?: string;
  types?: string;
  exports?: unknown;
  prisma?: { schema?: string };
  workspaces?: string[] | { packages?: string[] };
}

interface PackageRoot {
  root: string;
  surface: PulseScopeSurface;
}

export interface WorkspaceStructure {
  packageRoots: PackageRoot[];
  sourceSignalRoots: PackageRoot[];
  tsconfigRoots: Set<string>;
  prismaRoots: Set<string>;
  scriptRoots: Set<string>;
  documentRoots: Set<string>;
  infrastructureRoots: Set<string>;
  protectedExact: Set<string>;
  protectedPrefixes: Set<string>;
  structuralNoiseSegments: Set<string>;
}

const structureCache = new Map<string, WorkspaceStructure>();
const PACKAGE_SCAN_SKIP_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.pulse',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
]);
const PACKAGE_SCAN_MAX_DEPTH = 4;
const SOURCE_SIGNAL_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function readPackageJson(filePath: string): PackageJsonShape | null {
  return readJsonObject(filePath) as PackageJsonShape | null;
}

function dependencyNames(pkg: PackageJsonShape): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
}

function stringRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function inferPackageSurface(pkg: PackageJsonShape, relRoot: string): PulseScopeSurface {
  const deps = dependencyNames(pkg);
  const identity = `${pkg.name ?? ''} ${relRoot}`.toLowerCase();
  if (deps.has('next')) {
    return identity.includes('admin') ? 'frontend-admin' : 'frontend';
  }
  if (deps.has('@nestjs/core')) {
    return 'backend';
  }
  if (deps.has('bullmq') || identity.includes('worker')) {
    return 'worker';
  }
  if (deps.has('@playwright/test') || identity.includes('e2e')) {
    return 'e2e';
  }
  return 'misc';
}

function inferSourceSurface(source: string, basename: string): PulseScopeSurface | null {
  if (
    source.includes('from "next/') ||
    source.includes("from 'next/") ||
    source.includes('from "react"') ||
    source.includes("from 'react'") ||
    basename === 'page.tsx' ||
    basename === 'layout.tsx'
  ) {
    return 'frontend';
  }
  if (
    source.includes('@nestjs/') ||
    source.includes('@Controller(') ||
    source.includes('@Injectable(') ||
    basename.endsWith('.controller.ts') ||
    basename.endsWith('.module.ts')
  ) {
    return 'backend';
  }
  if (
    source.includes('bullmq') ||
    source.includes('new Worker(') ||
    source.includes('new Queue(') ||
    basename.includes('.worker.')
  ) {
    return 'worker';
  }
  if (source.includes('@playwright/test') || basename.endsWith('.e2e-spec.ts')) {
    return 'e2e';
  }
  return null;
}

function addDirectoryRoot(target: Set<string>, relPath: string): void {
  const normalized = normalizePath(relPath).replace(/\/[^/]*$/, '');
  if (normalized && normalized !== '.') {
    target.add(normalized);
  }
}

function addRootFromPackageReference(
  target: Set<string>,
  packageRoot: string,
  reference: string,
): void {
  if (!reference || path.isAbsolute(reference) || hasProtocolPrefix(reference)) {
    return;
  }
  addDirectoryRoot(target, normalizePath(path.join(packageRoot, reference)));
}

function hasProtocolPrefix(value: string): boolean {
  const colonIndex = value.indexOf(':');
  if (colonIndex <= 0) {
    return false;
  }
  return value
    .slice(0, colonIndex)
    .split('')
    .every((char) => {
      const lower = char.toLowerCase();
      return lower >= 'a' && lower <= 'z';
    });
}

function addRootSegmentsToNoise(structure: WorkspaceStructure, relRoot: string): void {
  for (const segment of relRoot.split('/')) {
    if (segment) {
      structure.structuralNoiseSegments.add(segment.toLowerCase());
    }
  }
}

function sourceSignalRoot(relPath: string): string {
  const normalized = normalizePath(relPath);
  const segments = normalized.split('/');
  const srcIndex = segments.indexOf('src');
  if (srcIndex > 0) {
    return segments.slice(0, srcIndex).join('/');
  }
  return normalizePath(path.dirname(normalized));
}

function addPackageEntrypointRoots(
  structure: WorkspaceStructure,
  pkg: PackageJsonShape,
  relRoot: string,
): void {
  for (const reference of [pkg.main, pkg.module, pkg.types]) {
    if (reference) {
      addRootFromPackageReference(structure.tsconfigRoots, relRoot, reference);
    }
  }
  const exportsRecord = stringRecord(pkg.exports);
  if (!exportsRecord) {
    if (typeof pkg.exports === 'string') {
      addRootFromPackageReference(structure.tsconfigRoots, relRoot, pkg.exports);
    }
    return;
  }
  for (const value of Object.values(exportsRecord)) {
    if (typeof value === 'string') {
      addRootFromPackageReference(structure.tsconfigRoots, relRoot, value);
      continue;
    }
    const nested = stringRecord(value);
    if (nested) {
      for (const nestedValue of Object.values(nested)) {
        if (typeof nestedValue === 'string') {
          addRootFromPackageReference(structure.tsconfigRoots, relRoot, nestedValue);
        }
      }
    }
  }
}

function addScriptRoots(
  structure: WorkspaceStructure,
  pkg: PackageJsonShape,
  relRoot: string,
): void {
  for (const command of Object.values(pkg.scripts ?? {})) {
    for (const referencedPath of extractLocalFileReferences(command)) {
      addRootFromPackageReference(structure.scriptRoots, relRoot, referencedPath);
    }
  }
}

function addPrismaRootFromPackage(
  structure: WorkspaceStructure,
  pkg: PackageJsonShape,
  relRoot: string,
): void {
  const schema = pkg.prisma?.schema;
  if (schema) {
    addRootFromPackageReference(structure.prismaRoots, relRoot, schema);
  }
}

function addGovernanceBoundary(structure: WorkspaceStructure, rootDir: string): void {
  const boundary = readJsonObject(path.join(rootDir, 'ops', 'protected-governance-files.json'));
  if (!boundary) {
    return;
  }
  const exact = Array.isArray(boundary.protectedExact) ? boundary.protectedExact : [];
  const prefixes = Array.isArray(boundary.protectedPrefixes) ? boundary.protectedPrefixes : [];
  for (const item of exact) {
    if (typeof item === 'string') {
      structure.protectedExact.add(normalizePath(item));
    }
  }
  for (const item of prefixes) {
    if (typeof item === 'string') {
      structure.protectedPrefixes.add(normalizePath(item));
    }
  }
}

function walkWorkspaceStructure(
  rootDir: string,
  currentDir: string,
  depth: number,
  structure: WorkspaceStructure,
): void {
  if (depth > PACKAGE_SCAN_MAX_DEPTH) {
    return;
  }
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const absolute = path.join(currentDir, entry.name);
    const relPath = normalizePath(path.relative(rootDir, absolute));
    if (entry.isDirectory()) {
      if (!PACKAGE_SCAN_SKIP_SEGMENTS.has(entry.name)) {
        walkWorkspaceStructure(rootDir, absolute, depth + 1, structure);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === 'package.json') {
      const pkg = readPackageJson(absolute);
      if (pkg) {
        const relRoot = normalizePath(path.dirname(relPath));
        if (relRoot !== '.') {
          structure.packageRoots.push({
            root: relRoot,
            surface: inferPackageSurface(pkg, relRoot),
          });
        }
        addPackageEntrypointRoots(structure, pkg, relRoot);
        addScriptRoots(structure, pkg, relRoot);
        addPrismaRootFromPackage(structure, pkg, relRoot);
        addRootSegmentsToNoise(structure, relRoot);
      }
    }
    if (entry.name.startsWith('tsconfig') && entry.name.endsWith('.json')) {
      addDirectoryRoot(structure.tsconfigRoots, relPath);
      addRootSegmentsToNoise(structure, path.dirname(relPath));
    }
    if (entry.name === 'schema.prisma' || entry.name === 'migration.sql') {
      addDirectoryRoot(structure.prismaRoots, relPath);
      addRootSegmentsToNoise(structure, path.dirname(relPath));
    }
    if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      addDirectoryRoot(structure.documentRoots, relPath);
      addRootSegmentsToNoise(structure, path.dirname(relPath));
    }
    if (SOURCE_SIGNAL_EXTENSIONS.has(path.extname(entry.name))) {
      const surface = inferSourceSurface(readFileSync(absolute, 'utf8'), entry.name);
      if (surface) {
        const root = sourceSignalRoot(relPath);
        structure.sourceSignalRoots.push({ root, surface });
        addRootSegmentsToNoise(structure, root);
      }
    }
    if (
      entry.name === 'Dockerfile' ||
      entry.name.startsWith('Dockerfile.') ||
      entry.name.endsWith('.conf')
    ) {
      addDirectoryRoot(structure.infrastructureRoots, relPath);
      addRootSegmentsToNoise(structure, path.dirname(relPath));
    }
  }
}

export function discoverWorkspaceStructure(rootDir: string): WorkspaceStructure {
  const resolvedRoot = path.resolve(rootDir);
  const cached = structureCache.get(resolvedRoot);
  if (cached) {
    return cached;
  }
  const structure: WorkspaceStructure = {
    packageRoots: [],
    sourceSignalRoots: [],
    tsconfigRoots: new Set<string>(),
    prismaRoots: new Set<string>(),
    scriptRoots: new Set<string>(),
    documentRoots: new Set<string>(),
    infrastructureRoots: new Set<string>(),
    protectedExact: new Set<string>(),
    protectedPrefixes: new Set<string>(),
    structuralNoiseSegments: new Set(STRUCTURAL_NOISE_SEGMENTS),
  };
  if (existsSync(resolvedRoot) && statSync(resolvedRoot).isDirectory()) {
    walkWorkspaceStructure(resolvedRoot, resolvedRoot, 0, structure);
    addGovernanceBoundary(structure, resolvedRoot);
  }
  structure.packageRoots.sort((left, right) => right.root.length - left.root.length);
  structure.sourceSignalRoots.sort((left, right) => right.root.length - left.root.length);
  structureCache.set(resolvedRoot, structure);
  return structure;
}

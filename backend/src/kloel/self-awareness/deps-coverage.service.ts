import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AffectedResult,
  DepResult,
  FileDeps,
  REPO_ROOT,
  SBOM_DIR,
  SimpleCoverage,
  affectedTestsImpl,
  fileSimpleCoverage,
  filterDeps,
  findImporters,
  isWorkspace,
  looksLikeFilePath,
  parseImports,
  parseSbom,
  simpleModuleCoverage,
} from './deps-coverage.helpers';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class DepsCoverageService {
  private readonly logger = new Logger(DepsCoverageService.name);
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly CACHE_MS = 60_000;
  private readonly SHORT_CACHE_MS = 5_000;

  // ── dependencies (overloaded) ──

  /** Static analysis: imports of a single file + reverse-lookup of files importing it. */
  async dependencies(filePath: string): Promise<FileDeps>;
  /** SBOM-based package listing for a workspace. */
  async dependencies(
    workspace: string,
    pattern?: string,
  ): Promise<{ success: boolean; deps?: DepResult[]; error?: string; count?: number }>;
  async dependencies(
    workspaceOrFile: string,
    pattern?: string,
  ): Promise<{ success: boolean; deps?: DepResult[]; error?: string; count?: number } | FileDeps> {
    // Branch: file-based dependency analysis when the arg looks like a file path
    if (
      !isWorkspace(workspaceOrFile) &&
      pattern === undefined &&
      looksLikeFilePath(workspaceOrFile)
    ) {
      return this.fileDependencies(workspaceOrFile);
    }

    if (!isWorkspace(workspaceOrFile)) {
      return { success: false, error: `invalid_workspace: ${workspaceOrFile}` };
    }

    const cacheKey = `deps:${workspaceOrFile}`;
    const cached = this.cacheGet<DepResult[]>(cacheKey);
    if (cached) {
      return filterDeps(cached, pattern);
    }

    try {
      const sbomPath = path.join(SBOM_DIR, `sbom-${workspaceOrFile}.json`);
      const raw = await fs.readFile(sbomPath, 'utf-8');
      const deps = parseSbom(raw);
      this.cacheSet(cacheKey, deps);
      return filterDeps(deps, pattern);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to read SBOM for ${workspaceOrFile}: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // ── codeCoverage (unified SimpleCoverage) ──

  /**
   * Returns simplified coverage: pct, total lines, uncovered line refs.
   * Pass a file path for per-file uncovered detail.
   * Pass a workspace name (e.g. "backend") or omit for summary.
   */
  async codeCoverage(filePath?: string, workspace?: string): Promise<SimpleCoverage> {
    if (filePath && isWorkspace(filePath) && workspace === undefined) {
      return simpleModuleCoverage(filePath, this.logger);
    }
    if (!filePath) {
      return simpleModuleCoverage(workspace, this.logger);
    }
    return fileSimpleCoverage(filePath, workspace, this.logger);
  }

  // ── affectedTests (overloaded) ──

  /** Single source file → test file paths. */
  async affectedTests(filePath: string): Promise<string[]>;
  /** Multiple source files → full affected-result with import details. */
  async affectedTests(sourceFiles: string[]): Promise<AffectedResult>;
  async affectedTests(input: string | string[]): Promise<string[] | AffectedResult> {
    const sourceFiles = Array.isArray(input) ? input : [input];
    const result = await affectedTestsImpl(sourceFiles, this.logger);
    if (!Array.isArray(input)) {
      return result.testFiles.map((t) => t.file);
    }
    return result;
  }

  // ── file-based dependency analysis (cached) ──

  private async fileDependencies(filePath: string): Promise<FileDeps> {
    const cacheKey = `filedeps:${filePath}`;
    const cached = this.cacheShortGet<FileDeps>(cacheKey);
    if (cached) {
      return cached;
    }

    const absPath = path.resolve(REPO_ROOT, filePath);
    const importersCacheKey = `importers:${filePath}`;
    const cachedImporters = this.cacheShortGet<string[]>(importersCacheKey);
    const [imports, importedBy] = await Promise.all([
      parseImports(absPath, this.logger),
      cachedImporters ? Promise.resolve(cachedImporters) : findImporters(filePath, this.logger),
    ]);
    if (!cachedImporters) {
      this.cacheShortSet(importersCacheKey, importedBy);
    }

    const result: FileDeps = { imports, importedBy };
    this.cacheShortSet(cacheKey, result);
    return result;
  }

  // ── cache helpers ──

  private cacheGet<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private cacheSet<T>(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.CACHE_MS });
  }

  private cacheShortGet<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private cacheShortSet<T>(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.SHORT_CACHE_MS });
  }
}

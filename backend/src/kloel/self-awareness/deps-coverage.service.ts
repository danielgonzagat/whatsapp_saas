import { Injectable, Logger } from '@nestjs/common';
import {
  affectedTestsImpl,
  fileDependencies,
  fileSimpleCoverage,
  filterDeps,
  isWorkspace,
  simpleModuleCoverage,
  type AffectedResult,
  type CoverageResult,
  type DepResult,
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

  async dependencies(
    workspace: string,
    pattern?: string,
  ): Promise<{ success: boolean; deps?: DepResult[]; error?: string; count?: number }> {
    if (!isWorkspace(workspace)) {
      return { success: false, error: `invalid_workspace: ${workspace}` };
    }

    const cacheKey = `deps:${workspace}`;
    const cached = this.cacheGet<DepResult[]>(cacheKey);
    if (cached) {
      return filterDeps(cached, pattern);
    }

    try {
      const deps = await fileDependencies(workspace);
      this.cacheSet(cacheKey, deps);
      return filterDeps(deps, pattern);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to read SBOM for ${workspace}: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async codeCoverage(filePath?: string, workspace?: string): Promise<CoverageResult> {
    if (filePath) {
      return fileSimpleCoverage(filePath, workspace);
    }
    return simpleModuleCoverage(workspace);
  }

  async affectedTests(sourceFiles: string[]): Promise<AffectedResult> {
    return affectedTestsImpl(sourceFiles);
  }

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
}

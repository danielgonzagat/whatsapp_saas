import { pathExists, readTextFile } from '../../../safe-fs';
import { safeJoin } from '../../../safe-path';
import type { PulseProductGraph } from '../../../types.product-graph';
import type { PulseScopeFile, PulseScopeState } from '../../../types.truth.scope';
import {
  deriveZeroValue,
  discoverRouteSeparatorFromRuntime,
} from '../../../dynamic-reality-kernel';
import type { BrowserAuthStorageContract } from './types';

export function discoverStorageKeyPatterns(): RegExp {
  return /(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g;
}

export function discoverStorageConstPatterns(): RegExp {
  return /(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem|removeItem)\s*\(\s*([A-Z][A-Z0-9_]*)/g;
}

export function discoverCookieGetPatterns(): RegExp {
  return /cookies\s*\.\s*get\s*\(\s*['"`]([^'"`]+)['"`]/g;
}

export function discoverDocumentCookiePatterns(): RegExp {
  return /document\s*\.\s*cookie\s*=\s*['"`]([^=;'"`]+)=/g;
}

export function discoverConstLiteralPatterns(): RegExp {
  return /const\s+([A-Z][A-Z0-9_]*)\s*=\s*['"`]([^'"`]+)['"`]/g;
}

export function discoverConstJoinPatterns(): RegExp {
  return /const\s+([A-Z][A-Z0-9_]*)\s*=\s*\[([^\]]+)\]\.join\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
}

export function addStorageKey(contract: BrowserAuthStorageContract, key: string): void {
  const normalized = key.trim();
  if (!normalized) {
    return;
  }
  if (/guest|claim/i.test(normalized)) {
    return;
  }
  if (/workspace/i.test(normalized)) {
    contract.workspaceStorageKeys.push(normalized);
    return;
  }
  if (/onboarding/i.test(normalized)) {
    contract.onboardingStorageKeys.push(normalized);
    return;
  }
  if (/(token|jwt|session|access)/i.test(normalized)) {
    contract.tokenStorageKeys.push(normalized);
  }
}

export function addCookieName(contract: BrowserAuthStorageContract, name: string): void {
  const normalized = name.trim();
  if (/(token|auth|session|jwt)/i.test(normalized)) {
    contract.authCookieNames.push(normalized);
  }
}

export function discoverStringConstants(content: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const match of content.matchAll(discoverConstLiteralPatterns())) {
    constants.set(match[1], match[2]);
  }
  for (const match of content.matchAll(discoverConstJoinPatterns())) {
    const values = [...match[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map(
      (valueMatch) => valueMatch[1],
    );
    if (values.length > deriveZeroValue()) {
      constants.set(match[1], values.join(match[3]));
    }
  }
  return constants;
}

export function unique(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function getScopeRelativePath(file: unknown): string | null {
  if (!file || typeof file !== 'object') {
    return null;
  }
  const entry = file as Record<string, unknown>;
  const value = entry.path || entry.relativePath;
  return typeof value === 'string' && value ? value : null;
}

export function isScopeSourceFile(file: unknown): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  return entry.kind === 'source' || entry.isSource === true;
}

export function isFrontendScopeFile(file: unknown, relativePath: string): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  const sep = discoverRouteSeparatorFromRuntime();
  return (
    entry.surface === 'frontend' ||
    entry.surface === 'frontend-admin' ||
    relativePath.startsWith(`frontend${sep}`) ||
    relativePath.startsWith(`frontend-admin${sep}`)
  );
}

export function isLikelyAuthStorageFile(file: unknown, relativePath: string): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  return entry.userFacing === true || /auth|middleware|token|session/i.test(relativePath);
}

export function artifactIdToLikelySourcePath(artifactId: string): string | null {
  const sourceSlug = artifactId.split(':')[1];
  if (!sourceSlug?.startsWith('frontend-')) {
    return null;
  }
  const extensionMatch = sourceSlug.match(/-(tsx|ts|jsx|js|mjs|cjs)$/);
  if (!extensionMatch) {
    return null;
  }
  const extension = extensionMatch[1];
  const withoutExtension = sourceSlug.slice(0, -extension.length - 1);
  return `${withoutExtension.replace(/-/g, '/')}.${extension}`;
}

export function collectAuthArtifactSourceFiles(productGraph: PulseProductGraph | null): string[] {
  if (!productGraph) {
    return [];
  }
  const artifactIds = new Set<string>();
  for (const surface of productGraph.surfaces || []) {
    const text = `${surface.id} ${surface.name}`.toLowerCase();
    if (text.includes('auth') || text.includes('identity')) {
      for (const artifactId of surface.artifactIds || []) {
        artifactIds.add(artifactId);
      }
    }
  }
  return [...artifactIds]
    .map(artifactIdToLikelySourcePath)
    .filter((sourcePath): sourcePath is string => sourcePath !== null);
}

export function discoverStorageContract(
  rootDir: string,
  scopeState: PulseScopeState | null,
  productGraph: PulseProductGraph | null,
): BrowserAuthStorageContract {
  const contract: BrowserAuthStorageContract = {
    tokenStorageKeys: [],
    workspaceStorageKeys: [],
    onboardingStorageKeys: [],
    authCookieNames: [],
  };

  const candidateFiles = unique([
    ...(scopeState?.files || [])
      .map((file) => ({ file, relativePath: getScopeRelativePath(file) }))
      .filter(
        (entry): entry is { file: PulseScopeFile; relativePath: string } =>
          entry.relativePath !== null,
      )
      .filter(({ file }) => isScopeSourceFile(file))
      .filter(({ file, relativePath }) => isFrontendScopeFile(file, relativePath))
      .filter(({ file, relativePath }) => isLikelyAuthStorageFile(file, relativePath))
      .map((entry) => entry.relativePath),
    ...collectAuthArtifactSourceFiles(productGraph),
  ]);

  for (const relativePath of candidateFiles) {
    const filePath = safeJoin(rootDir, relativePath);
    if (!pathExists(filePath)) {
      continue;
    }
    let content = '';
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const match of content.matchAll(discoverStorageKeyPatterns())) {
      addStorageKey(contract, match[1]);
    }
    const constants = discoverStringConstants(content);
    for (const match of content.matchAll(discoverStorageConstPatterns())) {
      const resolved = constants.get(match[1]);
      if (resolved) {
        addStorageKey(contract, resolved);
      }
    }
    for (const match of content.matchAll(discoverCookieGetPatterns())) {
      addCookieName(contract, match[1]);
    }
    for (const match of content.matchAll(discoverDocumentCookiePatterns())) {
      addCookieName(contract, match[1]);
    }
  }

  return {
    tokenStorageKeys: unique(contract.tokenStorageKeys),
    workspaceStorageKeys: unique(contract.workspaceStorageKeys),
    onboardingStorageKeys: unique(contract.onboardingStorageKeys),
    authCookieNames: unique(contract.authCookieNames),
  };
}

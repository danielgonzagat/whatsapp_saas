import { pathExists, readTextFile } from '../../../safe-fs';
import { safeJoin } from '../../../safe-path';
import type { PulseProductGraph } from '../../../types.product-graph';
import type { PulseScopeFile, PulseScopeState } from '../../../types.truth.scope';
import type { BrowserAuthStorageContract } from './types';
import {
  STORAGE_KEY_RE,
  STORAGE_CONST_RE,
  COOKIE_GET_RE,
  DOCUMENT_COOKIE_RE,
  CONST_LITERAL_RE,
  CONST_JOIN_RE,
} from './types';

function addStorageKey(contract: BrowserAuthStorageContract, key: string): void {
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

function addCookieName(contract: BrowserAuthStorageContract, name: string): void {
  const normalized = name.trim();
  if (/(token|auth|session|jwt)/i.test(normalized)) {
    contract.authCookieNames.push(normalized);
  }
}

function discoverStringConstants(content: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const match of content.matchAll(CONST_LITERAL_RE)) {
    constants.set(match[1], match[2]);
  }
  for (const match of content.matchAll(CONST_JOIN_RE)) {
    const values = [...match[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map(
      (valueMatch) => valueMatch[1],
    );
    if (values.length > 0) {
      constants.set(match[1], values.join(match[3]));
    }
  }
  return constants;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function getScopeRelativePath(file: unknown): string | null {
  if (!file || typeof file !== 'object') {
    return null;
  }
  const entry = file as Record<string, unknown>;
  const value = entry.path || entry.relativePath;
  return typeof value === 'string' && value ? value : null;
}

function isScopeSourceFile(file: unknown): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  return entry.kind === 'source' || entry.isSource === true;
}

function isFrontendScopeFile(file: unknown, relativePath: string): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  return (
    entry.surface === 'frontend' ||
    entry.surface === 'frontend-admin' ||
    relativePath.startsWith('frontend/') ||
    relativePath.startsWith('frontend-admin/')
  );
}

function isLikelyAuthStorageFile(file: unknown, relativePath: string): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  return entry.userFacing === true || /auth|middleware|token|session/i.test(relativePath);
}

function artifactIdToLikelySourcePath(artifactId: string): string | null {
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

function collectAuthArtifactSourceFiles(productGraph: PulseProductGraph | null): string[] {
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
    for (const match of content.matchAll(STORAGE_KEY_RE)) {
      addStorageKey(contract, match[1]);
    }
    const constants = discoverStringConstants(content);
    for (const match of content.matchAll(STORAGE_CONST_RE)) {
      const resolved = constants.get(match[1]);
      if (resolved) {
        addStorageKey(contract, resolved);
      }
    }
    for (const match of content.matchAll(COOKIE_GET_RE)) {
      addCookieName(contract, match[1]);
    }
    for (const match of content.matchAll(DOCUMENT_COOKIE_RE)) {
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

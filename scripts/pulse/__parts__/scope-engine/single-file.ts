import * as path from 'path';
import { assertWithinRoot } from '../../lib/safe-path';
import { pathExists, readTextFile } from '../../safe-fs';
import { loadGovernanceBoundary } from '../../scope-state-classify';
import type { ScopeFileRole, ScopeFileStatus, ScopeFileEntry } from '../../types.scope-engine';
import { classifyFileExtension } from './constants';
import {
  isTestFile,
  isGeneratedFile,
  isProtectedFile,
  isSourceFile,
  classifyFileRole,
  computeExecutionMode,
} from './classifiers';
import { computeContentHash } from './walker';

export function classifyFileRolePublic(filePath: string, content: string): ScopeFileRole {
  return classifyFileRole(filePath, content);
}

export function detectNewFile(rootDir: string, filePath: string): ScopeFileEntry | null {
  const relativePath = assertWithinRoot(filePath, rootDir);

  if (!pathExists(filePath)) return null;

  let content: string;
  try {
    content = readTextFile(filePath);
  } catch {
    return null;
  }

  const extension = classifyFileExtension(filePath);
  const role = classifyFileRole(filePath, content);
  const isTest = isTestFile(filePath, content);
  const isGenerated = isGeneratedFile(filePath, content);
  const governanceBoundary = loadGovernanceBoundary(rootDir);
  const isProtected = isProtectedFile(rootDir, filePath, governanceBoundary);
  const executionMode = computeExecutionMode(filePath, extension, isProtected, content);
  const contentHash = computeContentHash(content);
  const now = new Date().toISOString();

  let status: ScopeFileStatus = 'classified';
  if (role === 'unknown') status = 'unknown';

  return {
    filePath,
    relativePath,
    extension,
    status,
    role,
    isSource: isSourceFile(filePath, extension, content),
    isTest,
    isGenerated,
    isProtected,
    executionMode,
    connections: [],
    connectedFrom: [],
    capabilityIds: [],
    flowIds: [],
    nodeIds: [],
    firstSeen: now,
    lastModified: now,
    contentHash,
    classificationConfidence: role !== 'unknown' ? 85 : 30,
  };
}

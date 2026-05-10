/**
 * Part 3: SDK import detection.
 */

import { builtinModules } from 'node:module';
import * as ts from 'typescript';
import { discoverSourceExtensionsFromObservedTypescript } from '../../dynamic-reality-kernel/token-evidence';
import { findBackendDir, parseSourceFile } from './part1_helpers';
import { readTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';

function collectPackageImports(content: string, filePath: string): string[] {
  const source = parseSourceFile(filePath, content);
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteral(specifier)) imports.push(specifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function normalizePackageName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('.') || trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('@')) {
    const parts = trimmed.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : trimmed;
  }
  return trimmed.split('/')[0] || null;
}

function looksLikeExternalSdkImport(packageName: string): boolean {
  return (
    !packageName.startsWith('@nestjs/') &&
    !packageName.startsWith('@types/') &&
    !packageName.startsWith('@prisma/') &&
    !packageName.startsWith('node:') &&
    !builtinModules.includes(packageName)
  );
}

export function scanProviderSdkUsage(rootDir: string): string[] {
  const detected = new Set<string>();
  const backendDir = findBackendDir(rootDir);
  if (!backendDir) return [];
  const files = walkFiles(backendDir, [...discoverSourceExtensionsFromObservedTypescript()]);
  for (const filePath of files) {
    let content: string;
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const rawImport of collectPackageImports(content, filePath)) {
      const packageName = normalizePackageName(rawImport);
      if (packageName && looksLikeExternalSdkImport(packageName)) detected.add(packageName);
    }
  }
  return [...detected];
}

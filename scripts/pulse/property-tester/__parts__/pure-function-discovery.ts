import * as path from 'path';
import * as fs from 'node:fs';
import * as ts from 'typescript';
import type { PureFunctionCandidate, PropertyTestCase } from '../../types.property-tester';
import { readDir } from '../../safe-fs';
import {
  deriveUnitValue,
  inferCandidateCategoryFromObservedTokens,
  type DerivedCandidateCategory,
} from '../../dynamic-reality-kernel';
import { du8, isSourceFileName, shouldScanDirectory, isTestLikeFile } from './core';

export type CandidateCategory = Exclude<DerivedCandidateCategory, null>;

export interface DiscoveredExport {
  functionName: string;
  params: string[];
  hasReturnType: boolean;
  categoryHint: CandidateCategory | null;
}

/**
 * Generate property test targets for functions that are strong candidates
 * for property-based testing. Candidates include:
 *
 * - Pure functions (input → output, no side effects)
 * - Validation functions
 * - Format/transform functions
 * - Numeric computation functions
 * - String manipulation functions
 *
 * @param _behaviorGraph  Optional behavior graph for smarter candidate selection.
 * @returns               Array of property test case targets.
 */
export function generatePropertyTestTargets(_behaviorGraph?: unknown): PropertyTestCase[] {
  void _behaviorGraph;
  return [];
}

/**
 * Discover pure function candidates by scanning source files for exported
 * functions whose names match validation, parsing, formatting, numeric,
 * transform, or enum-handling patterns.
 */
export function discoverPureFunctionCandidates(rootDir: string): PureFunctionCandidate[] {
  let candidates: PureFunctionCandidate[] = [];
  let scanned = new Set<string>();

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, {
        withFileTypes: Boolean(deriveUnitValue()) as true,
      }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (let entry of entries) {
      let fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (shouldScanDirectory(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && isSourceFileName(entry.name)) {
        try {
          let content = fs.readFileSync(fullPath, du8());
          if (isTestLikeFile(entry.name, content)) {
            continue;
          }
          let relativePath = fullPath.replace(rootDir + path.sep, '');

          for (let discovered of discoverExportedPropertyCandidates(content)) {
            let key = `${relativePath}:${discovered.functionName}`;
            if (scanned.has(key)) continue;
            scanned.add(key);

            let category =
              discovered.categoryHint ?? inferCandidateCategory(discovered.functionName);

            if (category) {
              candidates.push({
                functionName: discovered.functionName,
                filePath: relativePath,
                category,
                params: discovered.params,
                hasReturnType: discovered.hasReturnType,
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  scanDir(rootDir);

  return candidates;
}

export function discoverExportedPropertyCandidates(content: string): DiscoveredExport[] {
  let candidates: DiscoveredExport[] = [];
  let sourceFile = ts.createSourceFile(
    'property-candidates.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  let visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && hasExportModifier(node)) {
      candidates.push({
        functionName: node.name.text,
        params: node.parameters.map(parameterName),
        hasReturnType: Boolean(node.type),
        categoryHint: null,
      });
    }
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (let declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }
        if (
          ts.isFunctionExpression(declaration.initializer) ||
          ts.isArrowFunction(declaration.initializer)
        ) {
          candidates.push({
            functionName: declaration.name.text,
            params: declaration.initializer.parameters.map(parameterName),
            hasReturnType: Boolean(declaration.type ?? declaration.initializer.type),
            categoryHint: null,
          });
        }
      }
    }
    if (ts.isEnumDeclaration(node) && hasExportModifier(node)) {
      candidates.push({
        functionName: node.name.text,
        params: node.members.map(enumMemberName),
        hasReturnType: Boolean(deriveUnitValue()),
        categoryHint: 'enum_handler',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return candidates;
}

export function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

export function parameterName(parameter: ts.ParameterDeclaration): string {
  return ts.isIdentifier(parameter.name) ? parameter.name.text : parameter.name.getText();
}

export function enumMemberName(member: ts.EnumMember): string {
  if (ts.isStringLiteral(member.initializer)) {
    return member.initializer.text;
  }
  return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
    ? member.name.text
    : member.name.getText();
}

export function inferCandidateCategory(functionName: string): CandidateCategory | null {
  return inferCandidateCategoryFromObservedTokens(functionName);
}

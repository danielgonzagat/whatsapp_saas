import * as path from 'path';
import * as fs from 'node:fs';
import * as ts from 'typescript';
import { readDir } from '../../safe-fs';
import {
  du8,
  shouldScanDirectory,
  isSourceFileName,
  isTestLikeFile,
  hasToken,
  splitIdentifierTokens,
} from './util';
import type { CandidateCategory, DiscoveredExport } from './types';
import type { PureFunctionCandidate } from '../../types.property-tester';

export function discoverPureFunctionCandidates(rootDir: string): PureFunctionCandidate[] {
  let candidates: PureFunctionCandidate[] = [];
  let scanned = new Set<string>();

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
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

function discoverExportedPropertyCandidates(content: string): DiscoveredExport[] {
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
        hasReturnType: true,
        categoryHint: 'enum_handler',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return candidates;
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function parameterName(parameter: ts.ParameterDeclaration): string {
  return ts.isIdentifier(parameter.name) ? parameter.name.text : parameter.name.getText();
}

function enumMemberName(member: ts.EnumMember): string {
  if (ts.isStringLiteral(member.initializer)) {
    return member.initializer.text;
  }
  return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
    ? member.name.text
    : member.name.getText();
}

function inferCandidateCategory(functionName: string): CandidateCategory | null {
  let tokens = splitIdentifierTokens(functionName);
  if (hasToken(tokens, ['validate', 'valid', 'assert', 'check'])) return 'validation';
  if (hasToken(tokens, ['parse', 'deserialize', 'decode', 'extract'])) return 'parsing';
  if (hasToken(tokens, ['currency', 'amount', 'cents', 'money', 'brl'])) return 'money_handler';
  if (hasToken(tokens, ['format', 'serialize', 'encode', 'stringify', 'normalize'])) {
    return 'formatting';
  }
  if (
    hasToken(tokens, [
      'compute',
      'calculate',
      'sum',
      'multiply',
      'divide',
      'add',
      'subtract',
      'mul',
      'div',
    ])
  ) {
    return 'numeric';
  }
  if (hasToken(tokens, ['transform', 'convert', 'map', 'reduce', 'filter'])) return 'transform';
  if (
    hasToken(tokens, [
      'slugify',
      'truncate',
      'truncat',
      'pad',
      'sanitize',
      'escape',
      'unescape',
      'camel',
      'kebab',
      'pascal',
    ])
  ) {
    return 'string_manipulation';
  }
  if (hasToken(tokens, ['enum', 'status', 'state', 'type', 'kind', 'variant', 'mode'])) {
    return 'enum_handler';
  }
  return null;
}

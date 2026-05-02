/**
 * PULSE Parser 68: Hydration Tester (STATIC)
 * Layer 9: Frontend Health
 *
 * STATIC analysis: scans frontend pages for patterns that cause React
 * SSR/hydration mismatches without running a browser.
 *
 * BREAK TYPES:
 *   HYDRATION_MISMATCH (medium) — code pattern that causes SSR vs client render difference
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface HydrationEvidence {
  node: ts.Node;
  predicateKinds: string[];
  description: string;
  guidance: string;
}

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function diagnosticToken(value: string): string {
  let token = '';
  for (const char of value) {
    const lower = char.toLowerCase();
    const isAlphaNumeric = (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9');
    token += isAlphaNumeric ? lower : '-';
  }
  return token.split('-').filter(Boolean).join('-');
}

function buildHydrationDiagnostic(input: {
  config: PulseConfig;
  sourceFile: ts.SourceFile;
  file: string;
  evidence: HydrationEvidence;
}): Break {
  const { line } = input.sourceFile.getLineAndCharacterOfPosition(
    input.evidence.node.getStart(input.sourceFile),
  );
  const sourceLine = input.sourceFile.text.split('\n')[line]?.trim() ?? input.evidence.description;
  const predicateToken =
    input.evidence.predicateKinds.map(diagnosticToken).filter(Boolean).join('+') ||
    'hydration-observation';

  return {
    type: `diagnostic:hydration-tester:${predicateToken}`,
    severity: 'medium',
    file: path.relative(input.config.rootDir, input.file),
    line: line + 1,
    description: input.evidence.description,
    detail: `${sourceLine.slice(0, 120)} — ${input.evidence.guidance}`,
    source: `syntax-evidence:hydration-tester;predicates=${input.evidence.predicateKinds.join(',')}`,
    surface: 'frontend-hydration',
  };
}

function isSkippableSourceFile(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  const lowerPath = normalized.toLowerCase();
  const segments = lowerPath.split('/');
  const fileName = segments[segments.length - 1] ?? '';
  return (
    fileName.endsWith('.spec.ts') ||
    fileName.endsWith('.spec.tsx') ||
    fileName.endsWith('.test.ts') ||
    fileName.endsWith('.test.tsx') ||
    segments.includes('__tests__') ||
    segments.includes('__mocks__') ||
    segments.includes('node_modules') ||
    segments.includes('.next')
  );
}

function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  const [firstStatement] = sourceFile.statements;
  if (!firstStatement || !ts.isExpressionStatement(firstStatement)) {
    return false;
  }
  return (
    ts.isStringLiteral(firstStatement.expression) && firstStatement.expression.text === 'use client'
  );
}

function isWindowIdentifier(node: ts.Node): boolean {
  return ts.isIdentifier(node) && node.text === 'window';
}

function expressionReadsBrowserRuntime(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      (ts.isPropertyAccessExpression(child) &&
        (isWindowIdentifier(child.expression) ||
          (ts.isIdentifier(child.expression) && child.expression.text === 'document') ||
          (ts.isIdentifier(child.expression) && child.expression.text === 'navigator'))) ||
      (ts.isIdentifier(child) && (child.text === 'localStorage' || child.text === 'sessionStorage'))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function expressionHasWindowTypeofGuard(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isTypeOfExpression(child) && isWindowIdentifier(child.expression)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function isUseStateCall(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === 'useState';
}

function nodeContainsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function attributeNameText(name: ts.JsxAttributeName): string {
  return ts.isIdentifier(name) ? name.text : name.getText();
}

function collectHydrationEvidence(sourceFile: ts.SourceFile): HydrationEvidence[] {
  const evidence: HydrationEvidence[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && attributeNameText(node.name) === 'suppressHydrationWarning') {
      evidence.push({
        node,
        predicateKinds: ['suppressed hydration warning attribute'],
        description: 'JSX suppresses hydration warnings from server/client divergence',
        guidance:
          'The attribute is evidence of a known mismatch; move browser-only state behind an effect or remove the divergence.',
      });
    }

    if (ts.isCallExpression(node) && isUseStateCall(node)) {
      const [initializer] = node.arguments;
      if (
        initializer &&
        ts.isExpression(initializer) &&
        expressionReadsBrowserRuntime(initializer) &&
        !expressionHasWindowTypeofGuard(initializer)
      ) {
        evidence.push({
          node: initializer,
          predicateKinds: ['state initializer reads browser runtime'],
          description: 'useState initializer reads browser-only runtime before hydration',
          guidance:
            'Initialize with a server-stable value and populate browser runtime data inside useEffect.',
        });
      }
    }

    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      nodeContainsJsx(node.expression) &&
      expressionHasWindowTypeofGuard(node.expression)
    ) {
      evidence.push({
        node: node.expression,
        predicateKinds: ['render output branches on browser runtime'],
        description: 'Render output branches on browser-only runtime evidence',
        guidance:
          'Server and client can render different markup; gate the value through effect-backed state or a client-only boundary.',
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return evidence;
}

/** Check hydration. */
export function checkHydration(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const frontendFiles = walkFiles(config.frontendDir, ['.tsx', '.ts']).filter(
    (f) => !isSkippableSourceFile(f),
  );

  for (const file of frontendFiles) {
    const content = readSafe(file);
    if (!content) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    if (hasUseClientDirective(sourceFile)) {
      continue;
    }

    const lines = content.split('\n');
    const diagnostics = collectHydrationEvidence(sourceFile).filter((evidence) => {
      const { line } = sourceFile.getLineAndCharacterOfPosition(evidence.node.getStart(sourceFile));
      return !isCommentLine(lines[line] ?? '');
    });

    for (const evidence of diagnostics) {
      breaks.push(buildHydrationDiagnostic({ config, sourceFile, file, evidence }));
    }
  }

  return breaks;
}

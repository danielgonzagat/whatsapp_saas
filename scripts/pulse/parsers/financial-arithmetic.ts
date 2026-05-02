import * as path from 'path';
import * as ts from 'typescript';

import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { readTextFile } from '../safe-fs';
import { walkFiles } from './utils';

function isIgnoredSource(file: string): boolean {
  const normalized = file.toLowerCase();
  return (
    normalized.endsWith('.d.ts') ||
    normalized.includes('.spec.') ||
    normalized.includes('.test.') ||
    normalized.includes('fixture') ||
    normalized.includes('mock.')
  );
}

function lineFor(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function synthesizeArithmeticBreak(signal: PulseSignalEvidence): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );

  return {
    type: diagnostic.id,
    severity: 'high',
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: 'arithmetic-runtime-safety',
  };
}

function hasNearbyZeroGuard(sourceText: string, sourceFile: ts.SourceFile, node: ts.Node): boolean {
  if (!ts.isIdentifier(node)) {
    return false;
  }
  const divisorName = node.text;
  const nodeLine = lineFor(sourceFile, node);
  const lines = sourceText.split('\n');
  const context = lines
    .slice(Math.max(0, nodeLine - 12), nodeLine)
    .join('\n')
    .replace(/\s+/g, '');

  return [
    `${divisorName}!==0`,
    `${divisorName}!=0`,
    `${divisorName}>0`,
    `${divisorName}>=1`,
    `0!==${divisorName}`,
    `0!=${divisorName}`,
    `0<${divisorName}`,
    `1<=${divisorName}`,
    `Math.max(${divisorName}`,
  ].some((token) => context.includes(token));
}

/** Check arithmetic safety from AST-observed operations, without domain/path catalogs. */
export function checkFinancialArithmetic(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const files = walkFiles(config.backendDir, ['.ts']).filter((file) => !isIgnoredSource(file));

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'toFixed'
      ) {
        const parent = node.parent;
        const wrappedByNumber =
          ts.isCallExpression(parent) &&
          ts.isIdentifier(parent.expression) &&
          parent.expression.text === 'Number';
        if (!wrappedByNumber) {
          breaks.push(
            synthesizeArithmeticBreak({
              source: 'ast:arithmetic-operation',
              detector: 'string-rounding-operation',
              truthMode: 'confirmed_static',
              summary:
                'AST observed numeric rounding call that returns string without numeric conversion',
              detail: node.getText(sourceFile).slice(0, 120),
              location: { file: relFile, line: lineFor(sourceFile, node) },
            }),
          );
        }
      }

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.SlashToken &&
        ts.isIdentifier(node.right) &&
        !hasNearbyZeroGuard(content, sourceFile, node.right)
      ) {
        breaks.push(
          synthesizeArithmeticBreak({
            source: 'ast:arithmetic-operation',
            detector: 'unguarded-division-operation',
            truthMode: 'confirmed_static',
            summary: 'AST observed division by variable without nearby zero-guard evidence',
            detail: node.getText(sourceFile).slice(0, 120),
            location: { file: relFile, line: lineFor(sourceFile, node) },
          }),
        );
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return breaks;
}

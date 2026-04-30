import * as path from 'path';
import ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { readTextFile } from '../safe-fs';
import { walkFiles } from './utils';

function shouldSkipFile(file: string): boolean {
  return (
    /node_modules|\.next[/\\]|[/\\]dist[/\\]|\.(spec|test)\.(ts|tsx|js|jsx)$|__tests__|__mocks__|[/\\]fixture|[/\\]seed\./i.test(
      file,
    ) ||
    // Skip the pulse scripts themselves to avoid self-reporting false positives
    /[/\\]scripts[/\\]pulse[/\\]/i.test(file)
  );
}

function scriptKindForFile(file: string): ts.ScriptKind {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.tsx') {
    return ts.ScriptKind.TSX;
  }
  if (extension === '.jsx') {
    return ts.ScriptKind.JSX;
  }
  if (extension === '.js') {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function sourceLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function nodeDetail(sourceFile: ts.SourceFile, node: ts.Node): string {
  return node.getText(sourceFile).replace(/\s+/g, ' ').trim().slice(0, 120);
}

function eventType(...parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function injectionBreakType(...parts: string[]): string {
  return eventType(...parts);
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

function isLiteralModuleSpecifier(node: ts.Expression | undefined): boolean {
  return Boolean(node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)));
}

function identifierText(node: ts.Node): string {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  return '';
}

function callsIdentifier(node: ts.CallExpression | ts.NewExpression, identifier: string): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === identifier;
}

function propertyNameText(name: ts.PropertyName | ts.JsxAttributeName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isJsxNamespacedName(name)) {
    return `${name.namespace.text}:${name.name.text}`;
  }
  return name.getText();
}

function expressionContainsSanitizerEvidence(expression: ts.Node): boolean {
  let hasEvidence = false;
  const visit = (node: ts.Node): void => {
    if (hasEvidence) {
      return;
    }
    const text = identifierText(node).toLowerCase();
    if (text.includes('sanitize') || text.includes('purify') || text === 'xss') {
      hasEvidence = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return hasEvidence;
}

function isDangerousHtmlEvidence(node: ts.Node): node is ts.JsxAttribute | ts.PropertyAssignment {
  if (ts.isJsxAttribute(node)) {
    return propertyNameText(node.name) === 'dangerouslySetInnerHTML';
  }
  if (ts.isPropertyAssignment(node)) {
    return propertyNameText(node.name) === 'dangerouslySetInnerHTML';
  }
  return false;
}

function dangerousHtmlHasSanitizerEvidence(node: ts.JsxAttribute | ts.PropertyAssignment): boolean {
  if (ts.isJsxAttribute(node)) {
    return Boolean(node.initializer && expressionContainsSanitizerEvidence(node.initializer));
  }
  return expressionContainsSanitizerEvidence(node.initializer);
}

function collectInjectionBreaks(sourceFile: ts.SourceFile, relFile: string, breaks: Break[]): void {
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && callsIdentifier(node, 'eval')) {
      pushBreak(breaks, {
        type: injectionBreakType('eval', 'usage'),
        severity: 'critical',
        file: relFile,
        line: sourceLine(sourceFile, node),
        description: 'eval() usage detected — code injection risk',
        detail: nodeDetail(sourceFile, node),
      });
    }

    if (ts.isNewExpression(node) && callsIdentifier(node, 'Function')) {
      const [firstArg] = node.arguments ?? [];
      if (!isLiteralModuleSpecifier(firstArg)) {
        pushBreak(breaks, {
          type: injectionBreakType('eval', 'usage'),
          severity: 'critical',
          file: relFile,
          line: sourceLine(sourceFile, node),
          description: 'new Function() with non-literal argument — code injection risk',
          detail: nodeDetail(sourceFile, node),
        });
      }
    }

    if (isDangerousHtmlEvidence(node) && !dangerousHtmlHasSanitizerEvidence(node)) {
      pushBreak(breaks, {
        type: injectionBreakType('xss', 'dangerous', 'html'),
        severity: 'critical',
        file: relFile,
        line: sourceLine(sourceFile, node),
        description: 'dangerouslySetInnerHTML usage — XSS risk if content is not sanitized',
        detail: nodeDetail(sourceFile, node),
      });
    }

    if (ts.isCallExpression(node) && callsIdentifier(node, 'require')) {
      const [firstArg] = node.arguments;
      if (!isLiteralModuleSpecifier(firstArg)) {
        pushBreak(breaks, {
          type: injectionBreakType('dynamic', 'require', 'risk'),
          severity: 'high',
          file: relFile,
          line: sourceLine(sourceFile, node),
          description: 'require() called with dynamic/variable argument — path injection risk',
          detail: nodeDetail(sourceFile, node),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

/** Check injection. */
export function checkInjection(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.frontendDir, config.backendDir, config.workerDir];

  for (const dir of dirs) {
    const files = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);

    for (const file of files) {
      if (shouldSkipFile(file)) {
        continue;
      }

      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }

      const relFile = path.relative(config.rootDir, file);
      const sourceFile = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKindForFile(file),
      );

      collectInjectionBreaks(sourceFile, relFile, breaks);
    }
  }

  return breaks;
}

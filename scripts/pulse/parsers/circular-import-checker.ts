import * as path from 'path';
import * as ts from 'typescript';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface ModuleNode {
  file: string;
  name: string;
  line: number;
  /** Names of modules that appear in this module's imports[] array (excluding forwardRef). */
  imports: string[];
}

interface ModuleCycleEvidence {
  closing: ModuleNode;
  cyclePath: string[];
  relativeFile: string;
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function isIdentifierNamed(node: ts.Node, expectedName: string): boolean {
  return ts.isIdentifier(node) && node.text === expectedName;
}

function isForwardRefExpression(expression: ts.Expression): boolean {
  return ts.isCallExpression(expression) && isIdentifierNamed(expression.expression, 'forwardRef');
}

function isModuleIdentifier(expression: ts.Expression): expression is ts.Identifier {
  return ts.isIdentifier(expression) && expression.text.endsWith('Module');
}

function moduleDecoratorObject(node: ts.ClassDeclaration): ts.ObjectLiteralExpression | null {
  const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  for (const decorator of decorators) {
    const expression = decorator.expression;
    if (!ts.isCallExpression(expression) || !isIdentifierNamed(expression.expression, 'Module')) {
      continue;
    }
    const [firstArgument] = expression.arguments;
    if (firstArgument && ts.isObjectLiteralExpression(firstArgument)) {
      return firstArgument;
    }
  }
  return null;
}

function extractModuleImportsFromDecorator(decoratorObject: ts.ObjectLiteralExpression): string[] {
  const imports = new Set<string>();
  for (const property of decoratorObject.properties) {
    if (!ts.isPropertyAssignment(property) || propertyNameText(property.name) !== 'imports') {
      continue;
    }
    if (!ts.isArrayLiteralExpression(property.initializer)) {
      continue;
    }
    for (const element of property.initializer.elements) {
      if (isForwardRefExpression(element)) {
        continue;
      }
      if (isModuleIdentifier(element)) {
        imports.add(element.text);
      }
    }
  }
  return [...imports];
}

function collectModuleNode(file: string, content: string): ModuleNode | null {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  let moduleNode: ModuleNode | null = null;

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) {
      continue;
    }
    if (!statement.name.text.endsWith('Module')) {
      continue;
    }
    const decoratorObject = moduleDecoratorObject(statement);
    if (!decoratorObject) {
      continue;
    }
    const position = sourceFile.getLineAndCharacterOfPosition(statement.name.getStart(sourceFile));
    moduleNode = {
      file,
      name: statement.name.text,
      line: position.line + 1,
      imports: extractModuleImportsFromDecorator(decoratorObject),
    };
    break;
  }

  return moduleNode;
}

function cycleDiagnosticBreak(evidence: ModuleCycleEvidence): Break {
  const uniqueModuleCount = new Set(evidence.cyclePath).size;
  const signal: PulseSignalEvidence = {
    source: 'circular-import-checker',
    detector: 'nestjs-module-cycle',
    truthMode: 'confirmed_static',
    summary: `${evidence.closing.name} closes a NestJS module dependency cycle`,
    location: { file: evidence.relativeFile, line: evidence.closing.line },
    detail: `Cycle: ${evidence.cyclePath.join(' -> ')}`,
  };
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({
      predicateGraph,
      runtimeImpact: uniqueModuleCount / Math.max(uniqueModuleCount, evidence.cyclePath.length),
    }),
  );

  return {
    type: diagnostic.id,
    severity: 'high',
    file: evidence.relativeFile,
    line: evidence.closing.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: evidence.cyclePath.join(' -> '),
  };
}

function appendBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

/** Check circular imports. */
export function checkCircularImports(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const moduleFiles = walkFiles(config.backendDir, ['.ts']);

  const nodes: ModuleNode[] = [];
  const nameToNode = new Map<string, ModuleNode>();

  for (const mf of moduleFiles) {
    let content: string;
    try {
      content = readTextFile(mf, 'utf8');
    } catch {
      continue;
    }

    const node = collectModuleNode(mf, content);
    if (!node) {
      continue;
    }
    nodes.push(node);
    nameToNode.set(node.name, node);
  }

  // DFS cycle detection
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const cycleFiles = new Set<string>();

  for (const node of nodes) {
    color.set(node.name, WHITE);
  }

  function dfs(current: ModuleNode, stack: string[]): void {
    color.set(current.name, GRAY);
    stack.push(current.name);

    for (const importedName of current.imports) {
      const imported = nameToNode.get(importedName);
      if (!imported) {
        continue;
      }

      const c = color.get(importedName) ?? WHITE;

      if (c === GRAY) {
        // Found a cycle — `current` closes the cycle back to `importedName`
        const cycleKey = current.name;
        if (!cycleFiles.has(cycleKey)) {
          cycleFiles.add(cycleKey);
          const relFile = path.relative(config.rootDir, current.file);

          // Find the cycle path for detail message
          const cycleStart = stack.indexOf(importedName);
          const cyclePath = [...stack.slice(cycleStart), importedName];
          appendBreak(
            breaks,
            cycleDiagnosticBreak({
              closing: current,
              cyclePath,
              relativeFile: relFile,
            }),
          );
        }
      } else if (c === WHITE) {
        dfs(imported, stack);
      }
    }

    stack.pop();
    color.set(current.name, BLACK);
  }

  for (const node of nodes) {
    if ((color.get(node.name) ?? WHITE) === WHITE) {
      dfs(node, []);
    }
  }

  return breaks;
}

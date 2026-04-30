import * as path from 'path';
import ts from 'typescript';
import type { PulseScopeState, PulseStructuralNode, PulseTruthMode } from './types';
import { readTextFile } from './safe-fs';

type SideEffectSignal =
  | 'network_call'
  | 'queue_dispatch'
  | 'event_emit'
  | 'message_send'
  | 'state_mutation'
  | 'file_write'
  | 'file_upload'
  | 'generated_artifact'
  | 'external_sdk_call';

const HTTP_METHOD_KERNEL_GRAMMAR = new Set(['get', 'post', 'put', 'patch', 'delete', 'request']);
const MUTATION_METHOD_KERNEL_GRAMMAR = new Set([
  'set',
  'delete',
  'clear',
  'set-item',
  'remove-item',
]);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function compactWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function tokenSet(value: string): Set<string> {
  return new Set(compactWords(value).split('-').filter(Boolean));
}

function addBindingName(bindings: Set<string>, name: ts.BindingName): void {
  if (ts.isIdentifier(name)) {
    bindings.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) {
      continue;
    }
    addBindingName(bindings, element.name);
  }
}

function packageBindingName(moduleName: string): string | null {
  const packageBase = moduleName.split('/').filter(Boolean).pop();
  return packageBase ? compactWords(packageBase).replace(/-/g, '') : null;
}

function isExternalModuleName(moduleName: string): boolean {
  return !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
}

function collectExternalImportBindings(sourceFile: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      if (isExternalModuleName(moduleName)) {
        const importClause = node.importClause;
        if (importClause?.name) {
          bindings.add(importClause.name.text);
        }
        const namedBindings = importClause?.namedBindings;
        if (namedBindings && ts.isNamespaceImport(namedBindings)) {
          bindings.add(namedBindings.name.text);
        }
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            bindings.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'require'
    ) {
      const [moduleSpecifier] = node.initializer.arguments;
      if (
        moduleSpecifier &&
        ts.isStringLiteral(moduleSpecifier) &&
        isExternalModuleName(moduleSpecifier.text)
      ) {
        addBindingName(bindings, node.name);
        const packageName = packageBindingName(moduleSpecifier.text);
        if (packageName) {
          bindings.add(packageName);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return bindings;
}

function receiverText(node: ts.Expression): string {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return `${receiverText(node.expression)}.${node.name.text}`;
  }
  if (ts.isCallExpression(node)) {
    return receiverText(node.expression);
  }
  return node.getText();
}

function calledName(call: ts.CallExpression): string | null {
  if (ts.isIdentifier(call.expression)) {
    return call.expression.text;
  }
  if (ts.isPropertyAccessExpression(call.expression)) {
    return call.expression.name.text;
  }
  return null;
}

function callReceiver(call: ts.CallExpression): string {
  if (ts.isPropertyAccessExpression(call.expression)) {
    return receiverText(call.expression.expression);
  }
  return '';
}

function hasExternalSdkCall(sourceFile: ts.SourceFile): boolean {
  const bindings = collectExternalImportBindings(sourceFile);
  if (bindings.size === 0) {
    return false;
  }

  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      if (ts.isIdentifier(receiver) && bindings.has(receiver.text)) {
        found = true;
        return;
      }
    }

    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      bindings.has(node.expression.text)
    ) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function readFile(rootDir: string, filePath: string): string {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
    return readTextFile(absolutePath, 'utf8');
  } catch {
    return '';
  }
}

function hasToken(tokens: Set<string>, value: string): boolean {
  return tokens.has(value);
}

function hasAnyToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function literalText(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function classifyCall(call: ts.CallExpression): SideEffectSignal[] {
  const name = calledName(call);
  if (!name) {
    return [];
  }

  const signals: SideEffectSignal[] = [];
  const receiver = callReceiver(call);
  const nameTokens = tokenSet(name);
  const receiverTokens = tokenSet(receiver);
  const combinedTokens = tokenSet(`${receiver} ${name}`);
  const normalizedName = compactWords(name);
  const normalizedReceiver = compactWords(receiver);

  if (
    name === 'fetch' ||
    normalizedReceiver.includes('http') ||
    HTTP_METHOD_KERNEL_GRAMMAR.has(normalizedName)
  ) {
    signals.push('network_call');
  }
  if (
    (hasToken(receiverTokens, 'queue') && normalizedName === 'add') ||
    hasAnyToken(combinedTokens, ['bull', 'bullmq'])
  ) {
    signals.push('queue_dispatch');
  }
  if (hasAnyToken(nameTokens, ['emit', 'publish']) || normalizedName === 'dispatch-event') {
    signals.push('event_emit');
  }
  if (normalizedName.startsWith('send') || hasAnyToken(nameTokens, ['reply', 'notify'])) {
    signals.push('message_send');
  }
  if (
    name === 'cookies' ||
    hasAnyToken(receiverTokens, ['cookie', 'cookies', 'storage']) ||
    MUTATION_METHOD_KERNEL_GRAMMAR.has(normalizedName)
  ) {
    signals.push('state_mutation');
  }
  if (
    normalizedName === 'write-file' ||
    normalizedName === 'append-file' ||
    normalizedName === 'create-write-stream'
  ) {
    signals.push('file_write');
  }
  if (hasAnyToken(combinedTokens, ['upload', 'uploaded'])) {
    signals.push('file_upload');
  }
  if (
    normalizedName === 'to-data-url' ||
    normalizedName === 'array-buffer' ||
    (normalizedReceiver === 'buffer' && normalizedName === 'from') ||
    call.arguments.some((argument) => literalText(argument)?.toLowerCase() === 'base64')
  ) {
    signals.push('generated_artifact');
  }

  return signals;
}

function decoratorName(node: ts.Decorator): string {
  const expression = node.expression;
  if (ts.isCallExpression(expression)) {
    const name = calledName(expression);
    return name || expression.getText();
  }
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return expression.getText();
}

function collectSideEffectSignals(sourceFile: ts.SourceFile): SideEffectSignal[] {
  const signals: SideEffectSignal[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      signals.push(...classifyCall(node));
    }

    if (
      ts.isDecorator(node) &&
      hasAnyToken(tokenSet(decoratorName(node)), ['file', 'files', 'uploaded'])
    ) {
      signals.push('file_upload');
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (hasExternalSdkCall(sourceFile)) {
    signals.push('external_sdk_call');
  }

  return unique(signals);
}

/** Build side effect signals. */
export function buildSideEffectSignals(
  rootDir: string,
  files: string[],
  scopeByPath: Map<string, PulseScopeState['files'][number]>,
  truthMode: PulseTruthMode,
): PulseStructuralNode[] {
  const nodes: PulseStructuralNode[] = [];

  for (const filePath of unique(files).filter(Boolean)) {
    const relativePath = normalizePath(filePath);
    const content = readFile(rootDir, relativePath);
    if (!content) {
      continue;
    }

    const sourceFile = ts.createSourceFile(relativePath, content, ts.ScriptTarget.Latest, true);
    const signals = collectSideEffectSignals(sourceFile);

    for (const label of unique(signals)) {
      const file = scopeByPath.get(relativePath) || null;
      nodes.push({
        id: `side-effect:${compactWords(relativePath)}:${label}`,
        kind: 'side_effect_signal',
        role: 'side_effect',
        truthMode,
        adapter: 'side-effect-signal',
        label: `${label} in ${path.basename(relativePath)}`,
        file: relativePath,
        line: 1,
        userFacing: Boolean(file?.userFacing),
        runtimeCritical: Boolean(file?.runtimeCritical),
        protectedByGovernance: Boolean(file?.protectedByGovernance),
        metadata: {
          signal: label,
          filePath: relativePath,
        },
      });
    }
  }

  return nodes;
}

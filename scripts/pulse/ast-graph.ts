// PULSE — Live Codebase Nervous System
// AST-resolved call graph builder using ts-morph Compiler API.
// Replaces regex-based call resolution with type-aware symbol traces.

import * as path from 'path';
import { METHODS as NODE_HTTP_METHODS } from 'http';
import { Project, Node, type Decorator } from 'ts-morph';
import { pathExists, ensureDir, writeTextFile } from './safe-fs';
import { sourceGlobsForTsMorph } from './source-root-detector';
import type {
  AstCallGraph,
  AstCallEdge,
  AstCallEdgeKind,
  AstModuleGraph,
  AstResolvedNodeKind,
  AstResolvedSymbol,
} from './types.ast-graph';

type TsMorphSymbol = NonNullable<ReturnType<Node['getSymbol']>>;
type AstTargetSymbol = TsMorphSymbol & {
  getDeclarations?(): Node[];
};
type AstTypeChecker = ReturnType<Project['getTypeChecker']>;

type DecoratorSemanticRole =
  | 'class_controller'
  | 'framework_module'
  | 'provider'
  | 'http_route'
  | 'schedule'
  | 'queue_handler'
  | 'event_handler'
  | 'realtime_gateway'
  | 'graphql_resolver';

type DecoratorTargetKind = 'class' | 'method' | 'property' | 'unknown';

const SKIP_PATTERNS = [
  /[\\/]node_modules[\\/]/,
  /[\\/]dist[\\/]/,
  /[\\/]\.next[\\/]/,
  /[\\/]__tests__[\\/]/,
  /\.spec\.[jt]sx?$/,
  /\.test\.[jt]sx?$/,
  /\.d\.ts$/,
];

function shouldSkip(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}

function normalizePath(input: string): string {
  return input.split(path.sep).join('/');
}

let nextId = 0;

function generateId(prefix: string): string {
  nextId += 1;
  return `${prefix}_${nextId}`;
}

function buildSymbolId(filePath: string, name: string, line: number): string {
  return `${normalizePath(filePath)}:${name}:${line}`;
}

function buildEdgeId(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

function resolveSymbolId(symbol: { getName(): string }, filePath: string, line: number): string {
  return buildSymbolId(filePath, symbol.getName(), line);
}

interface FrameworkDecoratorMeta {
  decorator: string | null;
  frameworkHints: string[];
  semanticRoles: DecoratorSemanticRole[];
  httpMethod: string | null;
  routePath: string | null;
  authority: 'observed_ast_evidence' | 'unclassified_decorator';
}

function pathArgumentText(
  decorator: { getArguments(): Array<{ getText(): string }> },
  argumentIndex: number,
): string | null {
  const args = decorator.getArguments();
  const raw = args[argumentIndex]?.getText() ?? '';
  return /^(['"`]).*\1$/.test(raw) ? raw.replace(/^['"`]|['"`]$/g, '') : null;
}

function decoratorFullName(decorator: Decorator): string {
  try {
    return decorator.getFullName();
  } catch {
    return decorator.getName();
  }
}

function decoratorLocalBinding(decorator: Decorator): string {
  const fullName = decoratorFullName(decorator);
  return fullName.includes('.') ? fullName.split('.')[0] : decorator.getName();
}

function packageIdentityFromModuleSpecifier(moduleSpecifier: string): string {
  if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
    return `local-import:${moduleSpecifier}`;
  }

  const parts = moduleSpecifier.split('/');
  if (moduleSpecifier.startsWith('@') && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? moduleSpecifier;
}

function importedNameMatches(
  namedImport: {
    getName(): string;
    getAliasNode?(): { getText(): string } | undefined;
  },
  localName: string,
): boolean {
  return (namedImport.getAliasNode?.()?.getText() ?? namedImport.getName()) === localName;
}

function importSourceForDecorator(decorator: Decorator): string | null {
  const localName = decoratorLocalBinding(decorator);
  const sourceFile = decorator.getSourceFile();

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
    const namespaceImport = importDeclaration.getNamespaceImport();
    if (namespaceImport?.getText() === localName) {
      return `import:${packageIdentityFromModuleSpecifier(moduleSpecifier)}`;
    }

    const defaultImport = importDeclaration.getDefaultImport();
    if (defaultImport?.getText() === localName) {
      return `import:${packageIdentityFromModuleSpecifier(moduleSpecifier)}`;
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      if (importedNameMatches(namedImport, localName)) {
        return `import:${packageIdentityFromModuleSpecifier(moduleSpecifier)}`;
      }
    }
  }

  return null;
}

function declarationSourceForDecorator(decorator: Decorator): string | null {
  try {
    const symbol = decorator.getNameNode().getSymbol();
    const declaration = symbol?.getDeclarations()?.[0];
    if (!declaration) return null;
    const declarationFile = normalizePath(declaration.getSourceFile().getFilePath());
    const nodeModulesMarker = '/node_modules/';
    const nodeModulesIndex = declarationFile.lastIndexOf(nodeModulesMarker);
    if (nodeModulesIndex >= 0) {
      const packagePath = declarationFile.slice(nodeModulesIndex + nodeModulesMarker.length);
      return `package:${packageIdentityFromModuleSpecifier(packagePath)}`;
    }
    return `local-declaration:${declarationFile}`;
  } catch {
    return null;
  }
}

function observedDecoratorSources(decorator: Decorator): string[] {
  return [
    ...new Set(
      [importSourceForDecorator(decorator), declarationSourceForDecorator(decorator)].filter(
        (source): source is string => source != null,
      ),
    ),
  ].sort();
}

function isObjectConfigArgument(decorator: Decorator, keys: string[]): boolean {
  const firstArgument = decorator.getArguments()[0];
  if (!firstArgument || !Node.isObjectLiteralExpression(firstArgument)) return false;
  const propertyNames = new Set(
    firstArgument.getProperties().flatMap((property) => {
      if (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) {
        return [property.getName()];
      }
      return [];
    }),
  );
  return keys.some((key) => propertyNames.has(key));
}

function isHttpMethodDecoratorName(name: string): boolean {
  const upperName = name.toUpperCase();
  return upperName === 'ALL' || NODE_HTTP_METHODS.includes(upperName);
}

function inferDecoratorRoles(
  decorator: Decorator,
  targetKind: DecoratorTargetKind,
): DecoratorSemanticRole[] {
  const name = decorator.getName();
  const normalizedName = name.toLowerCase();
  const sources = observedDecoratorSources(decorator);
  const sourceText = sources.join('\n').toLowerCase();
  const roles = new Set<DecoratorSemanticRole>();

  if (targetKind === 'class') {
    if (normalizedName.includes('controller')) roles.add('class_controller');
    if (
      normalizedName.includes('module') ||
      isObjectConfigArgument(decorator, ['imports', 'providers', 'controllers'])
    ) {
      roles.add('framework_module');
    }
    if (normalizedName.includes('gateway')) roles.add('realtime_gateway');
    if (normalizedName.includes('resolver') || sourceText.includes('graphql')) {
      roles.add('graphql_resolver');
    }
    if (
      roles.size === 0 &&
      (normalizedName.includes('injectable') ||
        normalizedName.includes('service') ||
        normalizedName.includes('provider'))
    ) {
      roles.add('provider');
    }
  }

  if (targetKind === 'method') {
    if (isHttpMethodDecoratorName(name)) roles.add('http_route');
    if (/(cron|interval|timeout|schedule)/i.test(name)) roles.add('schedule');
    if (/(process|processor|queue|job|pattern)/i.test(name)) roles.add('queue_handler');
    if (/(event|subscribe|listen|message)/i.test(name)) roles.add('event_handler');
    if (/(query|mutation|subscription|resolver)/i.test(name) || sourceText.includes('graphql')) {
      roles.add('graphql_resolver');
    }
  }

  return [...roles];
}

function extractFrameworkDecoratorMeta(
  decorators: Iterable<Decorator>,
  targetKind: DecoratorTargetKind,
): FrameworkDecoratorMeta {
  let decorator: string | null = null;
  let httpMethod: string | null = null;
  let routePath: string | null = null;
  const frameworkHints = new Set<string>();
  const semanticRoles = new Set<DecoratorSemanticRole>();

  for (const d of decorators) {
    const name = d.getName();
    const roles = inferDecoratorRoles(d, targetKind);
    if (roles.length === 0) continue;

    decorator ??= name;
    for (const source of observedDecoratorSources(d)) {
      frameworkHints.add(source);
    }
    for (const role of roles) {
      semanticRoles.add(role);
    }
    if (isHttpMethodDecoratorName(name)) {
      httpMethod ??= name.toUpperCase();
    }
    routePath ??= pathArgumentText(d, 0);
  }

  return {
    decorator,
    frameworkHints: [...frameworkHints],
    semanticRoles: [...semanticRoles],
    httpMethod,
    routePath,
    authority: semanticRoles.size > 0 ? 'observed_ast_evidence' : 'unclassified_decorator',
  };
}

function hasSemanticRole(
  decoratorMeta: FrameworkDecoratorMeta,
  role: DecoratorSemanticRole,
): boolean {
  return decoratorMeta.semanticRoles.includes(role);
}

function classifySymbolKind(
  symbolName: string,
  decoratorMeta: FrameworkDecoratorMeta,
  node: Node,
  parentClass?: string | null,
): AstResolvedNodeKind {
  if (Node.isMethodDeclaration(node) || Node.isMethodSignature(node)) {
    if (node.getName() === 'constructor') return 'constructor';

    if (hasSemanticRole(decoratorMeta, 'http_route')) return 'api_route';
    if (hasSemanticRole(decoratorMeta, 'schedule')) return 'cron_job';
    if (hasSemanticRole(decoratorMeta, 'queue_handler')) return 'queue_processor';
    if (hasSemanticRole(decoratorMeta, 'event_handler')) return 'websocket_gateway';
    if (hasSemanticRole(decoratorMeta, 'graphql_resolver')) return 'graphql_resolver';

    return 'class_method';
  }

  if (Node.isFunctionDeclaration(node)) return 'function';
  if (Node.isArrowFunction(node)) return 'arrow_function';

  if (Node.isClassDeclaration(node)) {
    if (hasSemanticRole(decoratorMeta, 'class_controller')) return 'controller';
    if (hasSemanticRole(decoratorMeta, 'graphql_resolver')) return 'resolver';
    if (hasSemanticRole(decoratorMeta, 'realtime_gateway')) return 'websocket_gateway';
    if (hasSemanticRole(decoratorMeta, 'framework_module')) return 'module';
    if (hasSemanticRole(decoratorMeta, 'provider')) return 'service';
    return 'provider';
  }

  return 'function';
}

function classifyCallEdgeKind(node: Node, resolved: boolean): AstCallEdgeKind {
  if (Node.isNewExpression(node)) return 'new_expression';
  if (Node.isDecorator(node)) return 'decorator_application';
  if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) return 'jsx_usage';
  if (Node.isCallExpression(node)) {
    if (!resolved) return 'indirect_call';
    return 'direct_call';
  }
  return 'direct_call';
}

function resolveAliasedSymbol(
  symbol: TsMorphSymbol | undefined,
  typeChecker: AstTypeChecker,
): AstTargetSymbol | null {
  if (!symbol) return null;

  try {
    return (typeChecker.getAliasedSymbol(symbol) ?? symbol) as AstTargetSymbol;
  } catch {
    return symbol as AstTargetSymbol;
  }
}

function resolveCallExpression(
  node: Node,
  typeChecker: AstTypeChecker,
): { resolved: boolean; targetSymbol: AstTargetSymbol | null; genericArgs: string[] } {
  const genericArgs: string[] = [];
  let targetSymbol: AstTargetSymbol | null = null;
  let resolved = false;

  try {
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression();
      const symbol = resolveAliasedSymbol(expression.getSymbol(), typeChecker);
      if (symbol) {
        targetSymbol = symbol;
        resolved = true;
      }
    }
  } catch {
    // resolution failed, leave unresolved
  }

  try {
    if (Node.isCallExpression(node)) {
      const typeArgs = node.getTypeArguments();
      for (const ta of typeArgs) {
        genericArgs.push(ta.getText());
      }
    }
  } catch {
    // no type arguments or resolution failed
  }

  return { resolved, targetSymbol, genericArgs };
}
import "./__companions__/ast-graph.companion";

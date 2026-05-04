import { METHODS as NODE_HTTP_METHODS } from 'http';
import { Node, type Decorator } from 'ts-morph';
import { normalizePath } from './path-utils';
import type { DecoratorSemanticRole, DecoratorTargetKind } from './constants';

export interface FrameworkDecoratorMeta {
  decorator: string | null;
  frameworkHints: string[];
  semanticRoles: DecoratorSemanticRole[];
  httpMethod: string | null;
  routePath: string | null;
  authority: 'observed_ast_evidence' | 'unclassified_decorator';
}

export function pathArgumentText(
  decorator: { getArguments(): Array<{ getText(): string }> },
  argumentIndex: number,
): string | null {
  const args = decorator.getArguments();
  const raw = args[argumentIndex]?.getText() ?? '';
  return /^(['"`]).*\1$/.test(raw) ? raw.replace(/^['"`]|['"`]$/g, '') : null;
}

export function decoratorFullName(decorator: Decorator): string {
  try {
    return decorator.getFullName();
  } catch {
    return decorator.getName();
  }
}

export function decoratorLocalBinding(decorator: Decorator): string {
  const fullName = decoratorFullName(decorator);
  return fullName.includes('.') ? fullName.split('.')[0] : decorator.getName();
}

export function packageIdentityFromModuleSpecifier(moduleSpecifier: string): string {
  if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
    return `local-import:${moduleSpecifier}`;
  }

  const parts = moduleSpecifier.split('/');
  if (moduleSpecifier.startsWith('@') && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? moduleSpecifier;
}

export function importedNameMatches(
  namedImport: {
    getName(): string;
    getAliasNode?(): { getText(): string } | undefined;
  },
  localName: string,
): boolean {
  return (namedImport.getAliasNode?.()?.getText() ?? namedImport.getName()) === localName;
}

export function importSourceForDecorator(decorator: Decorator): string | null {
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

export function declarationSourceForDecorator(decorator: Decorator): string | null {
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

export function observedDecoratorSources(decorator: Decorator): string[] {
  return [
    ...new Set(
      [importSourceForDecorator(decorator), declarationSourceForDecorator(decorator)].filter(
        (source): source is string => source != null,
      ),
    ),
  ].sort();
}

export function isObjectConfigArgument(decorator: Decorator, keys: string[]): boolean {
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

export function isHttpMethodDecoratorName(name: string): boolean {
  const upperName = name.toUpperCase();
  return upperName === 'ALL' || NODE_HTTP_METHODS.includes(upperName);
}

export function inferDecoratorRoles(
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

export function extractFrameworkDecoratorMeta(
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

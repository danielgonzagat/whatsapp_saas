import * as path from 'path';
import { Project, Node, type Decorator } from 'ts-morph';
import { pathExists } from '../../safe-fs';
import { sourceGlobsForTsMorph } from '../../source-root-detector';
import type {
  AstCallGraph,
  AstCallEdge,
  AstModuleGraph,
  AstResolvedSymbol,
} from '../../types.ast-graph';
import { shouldSkip } from './constants';
import type { AstTargetSymbol } from './constants';
import { buildSymbolId, buildEdgeId, generateId, normalizePath } from './path-utils';
import { extractFrameworkDecoratorMeta } from './decorator-analysis';
import type { FrameworkDecoratorMeta } from './decorator-analysis';
import { classifySymbolKind, classifyCallEdgeKind } from './symbol-classification';
import {
  resolveCallExpression,
  resolveNewExpression,
  resolveDecorator,
  resolveJsxElement,
} from './symbol-resolution';
import {
  buildModuleGraph,
  extractDocComment,
  extractDecoratorNames,
  extractParameterTypes,
  extractReturnType,
  isSymbolExported,
  isDefaultExport,
} from './symbol-metadata';

export async function buildAstCallGraph(rootDir: string): Promise<AstCallGraph> {
  const tsconfigCandidates = [
    path.join(rootDir, 'tsconfig.json'),
    path.join(rootDir, 'backend', 'tsconfig.json'),
  ];
  const tsConfigFilePath = tsconfigCandidates.find((candidate) => pathExists(candidate));
  const project = new Project({
    ...(tsConfigFilePath ? { tsConfigFilePath } : {}),
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      skipLibCheck: true,
    },
  });

  const absoluteRoot = path.resolve(rootDir);

  const applicableGlobs = sourceGlobsForTsMorph(absoluteRoot);

  project.addSourceFilesAtPaths(applicableGlobs);

  const sourceFiles = project.getSourceFiles().filter((sf) => !shouldSkip(sf.getFilePath()));

  const typeChecker = project.getTypeChecker();

  const symbols: AstResolvedSymbol[] = [];
  const edges: AstCallEdge[] = [];
  const moduleGraphs: AstModuleGraph[] = [];
  const unresolvedCalls: AstCallGraph['unresolvedCalls'] = [];
  const parseErrors: AstCallGraph['parseErrors'] = [];

  const seenSymbolIds = new Set<string>();
  const seenEdgeIds = new Set<string>();

  for (const sourceFile of sourceFiles) {
    const filePath = normalizePath(sourceFile.getFilePath());

    const mg = buildModuleGraph(sourceFile);
    if (mg) moduleGraphs.push(mg);

    sourceFile.forEachDescendant((node) => {
      if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node)) {
        const name = node.getName() ?? '<anonymous>';
        const decorators = extractDecoratorNames(node);

        let decoratorMeta: FrameworkDecoratorMeta = {
          decorator: null,
          frameworkHints: [],
          semanticRoles: [],
          httpMethod: null,
          routePath: null,
          authority: 'unclassified_decorator',
        };
        if (Node.isClassDeclaration(node)) {
          decoratorMeta = extractFrameworkDecoratorMeta(node.getDecorators(), 'class');
        }

        const kind = classifySymbolKind(name, decoratorMeta, node, null);
        const id = buildSymbolId(filePath, name, node.getStartLineNumber());

        if (seenSymbolIds.has(id)) return;
        seenSymbolIds.add(id);

        symbols.push({
          id,
          name,
          kind,
          filePath,
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          isExported: isSymbolExported(node as unknown as Parameters<typeof isSymbolExported>[0]),
          isDefaultExport: isDefaultExport(
            node as unknown as Parameters<typeof isDefaultExport>[0],
          ),
          nestjsDecorator: decoratorMeta.decorator,
          httpMethod: decoratorMeta.httpMethod,
          routePath: decoratorMeta.routePath,
          parameterTypes: [],
          returnType: null,
          decorators,
          docComment: extractDocComment(node),
        });
      }

      if (Node.isClassDeclaration(node)) {
        const classNode = node as unknown as {
          getMethods(): Array<{
            getName(): string;
            getDecorators(): Array<{
              getName(): string;
              getArguments(): Array<{ getText(): string }>;
            }>;
            getStartLineNumber(): number;
            getStartLinePos(): number;
          }>;
          getProperties(): Array<{
            getName(): string;
            getDecorators?(): Array<{
              getName(): string;
              getArguments(): Array<{ getText(): string }>;
            }>;
            getStartLineNumber(): number;
            getStartLinePos(): number;
          }>;
          getName?(): string;
        };

        const parentClassName =
          typeof classNode.getName === 'function' ? classNode.getName() : null;

        for (const method of classNode.getMethods()) {
          const methodName = method.getName();
          const decorators =
            (method as unknown as { getDecorators?(): Decorator[] }).getDecorators?.() ?? [];
          const decoratorMeta = extractFrameworkDecoratorMeta(decorators, 'method');
          const kind = classifySymbolKind(
            methodName,
            decoratorMeta,
            method as unknown as Node,
            parentClassName,
          );

          const id = buildSymbolId(filePath, methodName, method.getStartLineNumber());
          if (seenSymbolIds.has(id)) continue;
          seenSymbolIds.add(id);

          symbols.push({
            id,
            name: `${parentClassName ? parentClassName + '.' : ''}${methodName}`,
            kind,
            filePath,
            line: method.getStartLineNumber(),
            column: method.getStartLinePos(),
            isExported: Node.isClassDeclaration(node)
              ? isSymbolExported(node as unknown as Parameters<typeof isSymbolExported>[0])
              : false,
            isDefaultExport: false,
            nestjsDecorator: decoratorMeta.decorator,
            httpMethod: decoratorMeta.httpMethod,
            routePath: decoratorMeta.routePath,
            parameterTypes: extractParameterTypes(method as unknown as Node),
            returnType: extractReturnType(
              method as unknown as Parameters<typeof extractReturnType>[0],
            ),
            decorators: decorators.map((d) => d.getName()),
            docComment: extractDocComment(method as unknown as Node),
          });
        }

        for (const prop of classNode.getProperties()) {
          const propName = prop.getName();
          const id = buildSymbolId(filePath, propName, prop.getStartLineNumber());
          if (seenSymbolIds.has(id)) continue;
          seenSymbolIds.add(id);

          const decorators =
            (
              prop as unknown as { getDecorators?(): Array<{ getName(): string }> }
            ).getDecorators?.() ?? [];

          symbols.push({
            id,
            name: `${parentClassName ? parentClassName + '.' : ''}${propName}`,
            kind: 'provider',
            filePath,
            line: prop.getStartLineNumber(),
            column: prop.getStartLinePos(),
            isExported: false,
            isDefaultExport: false,
            nestjsDecorator: null,
            httpMethod: null,
            routePath: null,
            parameterTypes: [],
            returnType: null,
            decorators: decorators.map((d) => d.getName()),
            docComment: extractDocComment(prop as unknown as Node),
          });
        }
      }

      let callNode: Node | null = null;
      if (
        Node.isCallExpression(node) ||
        Node.isNewExpression(node) ||
        Node.isDecorator(node) ||
        Node.isJsxOpeningElement(node) ||
        Node.isJsxSelfClosingElement(node)
      ) {
        callNode = node;
      }

      if (!callNode) return;
      if (Node.isCallExpression(callNode) && isInsideDecorator(callNode)) return;

      const line = callNode.getStartLineNumber();
      const fromSymbol = findEnclosingSymbol(callNode);
      const fromId = fromSymbol
        ? buildSymbolId(fromSymbol.filePath, fromSymbol.name, fromSymbol.line)
        : buildSymbolId(filePath, '<toplevel>', line);

      let resolved = false;
      let targetSymbol: AstTargetSymbol | null = null;
      let genericArgs: string[] = [];

      try {
        if (Node.isCallExpression(callNode)) {
          const result = resolveCallExpression(callNode, typeChecker);
          resolved = result.resolved;
          targetSymbol = result.targetSymbol;
          genericArgs = result.genericArgs;
        } else if (Node.isNewExpression(callNode)) {
          const result = resolveNewExpression(callNode, typeChecker);
          resolved = result.resolved;
          targetSymbol = result.targetSymbol;
          genericArgs = result.genericArgs;
        } else if (Node.isDecorator(callNode)) {
          const result = resolveDecorator(callNode, typeChecker);
          resolved = result.resolved;
          targetSymbol = result.targetSymbol;
          genericArgs = result.genericArgs;
        } else {
          const result = resolveJsxElement(
            callNode as Parameters<typeof resolveJsxElement>[0],
            typeChecker,
          );
          resolved = result.resolved;
          targetSymbol = result.targetSymbol;
          genericArgs = result.genericArgs;
        }
      } catch {
        // resolution error
      }

      const edgeKind = classifyCallEdgeKind(callNode, resolved);

      if (targetSymbol) {
        const toName = targetSymbol.getName();
        const targetDecl = (
          targetSymbol as unknown as { getDeclarations?(): Node[] }
        ).getDeclarations?.()?.[0];
        const targetLine = targetDecl ? targetDecl.getStartLineNumber() : 0;
        const targetFile = targetDecl
          ? normalizePath(targetDecl.getSourceFile().getFilePath())
          : filePath;
        const toId = buildSymbolId(targetFile, toName, targetLine);

        const edgeId = buildEdgeId(fromId, toId);
        if (seenEdgeIds.has(edgeId)) return;
        seenEdgeIds.add(edgeId);

        edges.push({
          id: generateId('edge'),
          from: fromId,
          to: toId,
          kind: edgeKind,
          filePath,
          line,
          resolved,
          genericArguments: genericArgs,
        });
      } else {
        const calleeText = extractCalleeText(callNode);
        unresolvedCalls.push({
          from: fromId,
          toName: calleeText,
          filePath,
          line,
          reason: 'symbol-not-resolved',
        });
      }
    });
  }

  const summary: AstCallGraph['summary'] = {
    totalSymbols: symbols.length,
    totalEdges: edges.length,
    resolvedEdges: edges.filter((e) => e.resolved).length,
    unresolvedEdges: edges.filter((e) => !e.resolved).length,
    interfaceDispatches: edges.filter((e) => e.kind === 'interface_dispatch').length,
    decoratorApplications: edges.filter((e) => e.kind === 'decorator_application').length,
    apiRoutesFound: symbols.filter((s) => s.kind === 'api_route').length,
    cronJobsFound: symbols.filter((s) => s.kind === 'cron_job').length,
    webhookHandlersFound: symbols.filter(
      (s) => s.kind === 'webhook_handler' || s.kind === 'websocket_gateway',
    ).length,
    queueProcessorsFound: symbols.filter((s) => s.kind === 'queue_processor').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    symbols,
    edges,
    moduleGraphs,
    unresolvedCalls,
    parseErrors,
  };
}

function isInsideDecorator(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    if (Node.isDecorator(current)) return true;
    current = current.getParent();
  }
  return false;
}

function findEnclosingSymbol(node: Node): { name: string; filePath: string; line: number } | null {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (
      Node.isFunctionDeclaration(current) ||
      Node.isMethodDeclaration(current) ||
      Node.isClassDeclaration(current)
    ) {
      const nameNode = current as unknown as { getName?(): string };
      if (typeof nameNode.getName === 'function') {
        const name = nameNode.getName();
        if (name && name !== 'constructor') {
          return {
            name,
            filePath: normalizePath(current.getSourceFile().getFilePath()),
            line: current.getStartLineNumber(),
          };
        }
      }
    }
    if (Node.isArrowFunction(current)) {
      const parent = current.getParent();
      if (parent && Node.isVariableDeclaration(parent)) {
        return {
          name: parent.getName(),
          filePath: normalizePath(parent.getSourceFile().getFilePath()),
          line: parent.getStartLineNumber(),
        };
      }
    }
    current = current.getParent();
  }
  return null;
}

function extractCalleeText(node: Node): string {
  try {
    if (Node.isCallExpression(node) || Node.isNewExpression(node)) {
      return node.getExpression().getText();
    }
    if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
      return node.getTagNameNode().getText();
    }
  } catch {
    return '<unknown>';
  }
  return '<unknown>';
}

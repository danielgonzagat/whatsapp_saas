// PULSE — AST Graph Main Builder
// Core buildAstCallGraph: walks the project with ts-morph and produces
// the full symbol/edge/module graph.

import * as path from 'path';
import { Project, Node, type Decorator } from 'ts-morph';
import { pathExists } from '../../safe-fs';
import { sourceGlobsForTsMorph } from '../../source-root-detector/api';
import type { AstCallGraph, AstCallEdge, AstResolvedSymbol } from '../../types.ast-graph';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/type-contract-labels';
import { deriveUnitValue } from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  type FrameworkDecoratorMeta,
  type AstTargetSymbol,
  shouldSkip,
  normalizePath,
  generateId,
  buildSymbolId,
  buildEdgeId,
} from './core-utils';
import {
  extractFrameworkDecoratorMeta,
  classifySymbolKind,
  classifyCallEdgeKind,
} from './decorators';
import {
  resolveCallExpression,
  resolveNewExpression,
  resolveDecorator,
  resolveJsxElement,
} from './resolution';
import {
  extractDocComment,
  extractDecoratorNames,
  extractParameterTypes,
  extractReturnType,
  isSymbolExported,
  isDefaultExport,
} from './extraction';
import {
  buildModuleGraph,
  isInsideDecorator,
  findEnclosingSymbol,
  extractCalleeText,
} from './graph-helpers';

function astNodeKind(kind: string): string {
  const members = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.ast-graph.ts',
    'AstResolvedNodeKind',
  );
  return members.has(kind) ? kind : (members.values().next().value ?? 'function');
}

function astEdgeKind(kind: string): string {
  const members = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.ast-graph.ts',
    'AstCallEdgeKind',
  );
  return members.has(kind) ? kind : (members.values().next().value ?? 'direct_call');
}

export async function buildAstCallGraph(rootDir: string): Promise<AstCallGraph> {
  const tsConfigFileName = 'tsconfig.json';
  const tsconfigCandidates = [
    path.join(rootDir, tsConfigFileName),
    path.join(rootDir, 'backend', tsConfigFileName),
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
  const moduleGraphs: ReturnType<typeof buildModuleGraph>[] = [];
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
          const methodDecorators =
            (method as unknown as { getDecorators?(): Decorator[] }).getDecorators?.() ?? [];
          const decoratorMeta = extractFrameworkDecoratorMeta(methodDecorators, 'method');
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
            decorators: methodDecorators.map((d) => d.getName()),
            docComment: extractDocComment(method as unknown as Node),
          });
        }

        for (const prop of classNode.getProperties()) {
          const propName = prop.getName();
          const id = buildSymbolId(filePath, propName, prop.getStartLineNumber());
          if (seenSymbolIds.has(id)) continue;
          seenSymbolIds.add(id);

          const propDecorators =
            (
              prop as unknown as { getDecorators?(): Array<{ getName(): string }> }
            ).getDecorators?.() ?? [];

          symbols.push({
            id,
            name: `${parentClassName ? parentClassName + '.' : ''}${propName}`,
            kind: astNodeKind('provider') as AstResolvedSymbol['kind'],
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
            decorators: propDecorators.map((d) => d.getName()),
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
    interfaceDispatches: edges.filter((e) => e.kind === astEdgeKind('interface_dispatch')).length,
    decoratorApplications: edges.filter((e) => e.kind === astEdgeKind('decorator_application'))
      .length,
    apiRoutesFound: symbols.filter((s) => s.kind === astNodeKind('api_route')).length,
    cronJobsFound: symbols.filter((s) => s.kind === astNodeKind('cron_job')).length,
    webhookHandlersFound: symbols.filter(
      (s) =>
        s.kind === astNodeKind('webhook_handler') || s.kind === astNodeKind('websocket_gateway'),
    ).length,
    queueProcessorsFound: symbols.filter((s) => s.kind === astNodeKind('queue_processor')).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    symbols,
    edges,
    moduleGraphs: moduleGraphs.filter((m): m is NonNullable<typeof m> => m != null),
    unresolvedCalls,
    parseErrors,
  };
}

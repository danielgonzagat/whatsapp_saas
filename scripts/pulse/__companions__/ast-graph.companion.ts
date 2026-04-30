function resolveNewExpression(
  node: Node,
  typeChecker: AstTypeChecker,
): {
  resolved: boolean;
  targetSymbol: AstTargetSymbol | null;
  genericArgs: string[];
} {
  const genericArgs: string[] = [];
  let targetSymbol: AstTargetSymbol | null = null;
  let resolved = false;

  try {
    if (Node.isNewExpression(node)) {
      const expression = node.getExpression();
      const symbol = resolveAliasedSymbol(expression.getSymbol(), typeChecker);
      if (symbol) {
        targetSymbol = symbol;
        resolved = true;
      }
    }
  } catch {
    // resolution failed
  }

  try {
    if (Node.isNewExpression(node)) {
      const typeArgs = node.getTypeArguments();
      for (const ta of typeArgs) {
        genericArgs.push(ta.getText());
      }
    }
  } catch {
    // no type arguments
  }

  return { resolved, targetSymbol, genericArgs };
}

function resolveDecorator(
  node: Node,
  typeChecker: AstTypeChecker,
): {
  resolved: boolean;
  targetSymbol: AstTargetSymbol | null;
  genericArgs: string[];
} {
  const genericArgs: string[] = [];
  let targetSymbol: AstTargetSymbol | null = null;
  let resolved = false;

  try {
    if (Node.isDecorator(node)) {
      const expression = node.getExpression();
      const symbol = Node.isCallExpression(expression)
        ? resolveAliasedSymbol(expression.getExpression().getSymbol(), typeChecker)
        : resolveAliasedSymbol(expression.getSymbol(), typeChecker);
      if (symbol) {
        targetSymbol = symbol;
        resolved = true;
      }
    }
  } catch {
    // resolution failed
  }

  return { resolved, targetSymbol, genericArgs };
}

function resolveJsxElement(
  node: Node & { getTagNameNode(): { getSymbol(): ReturnType<Node['getSymbol']> } },
  typeChecker: AstTypeChecker,
): { resolved: boolean; targetSymbol: AstTargetSymbol | null; genericArgs: string[] } {
  const genericArgs: string[] = [];
  let targetSymbol: AstTargetSymbol | null = null;
  let resolved = false;

  try {
    const tagNode = node.getTagNameNode();
    const symbol = resolveAliasedSymbol(tagNode.getSymbol(), typeChecker);
    if (symbol) {
      targetSymbol = symbol;
      resolved = true;
    }
  } catch {
    // resolution failed
  }

  return { resolved, targetSymbol, genericArgs };
}

function extractDocComment(node: Node): string | null {
  try {
    if (
      'getJsDocs' in node &&
      typeof (node as { getJsDocs?(): unknown[] }).getJsDocs === 'function'
    ) {
      const docs = (
        node as unknown as { getJsDocs(): Array<{ getDescriptionText(): string }> }
      ).getJsDocs();
      if (docs.length > 0) {
        return docs[0].getDescriptionText().trim() || null;
      }
    }
  } catch {
    // skip
  }
  return null;
}

function extractDecoratorNames(node: Node): string[] {
  try {
    if (
      'getDecorators' in node &&
      typeof (node as { getDecorators?(): unknown[] }).getDecorators === 'function'
    ) {
      return (node as unknown as { getDecorators(): Array<{ getName(): string }> })
        .getDecorators()
        .map((d) => d.getName());
    }
  } catch {
    // skip
  }
  return [];
}

function extractParameterTypes(node: Node): string[] {
  const types: string[] = [];
  try {
    if (
      'getParameters' in node &&
      typeof (node as { getParameters(): unknown[] }).getParameters === 'function'
    ) {
      const params = (
        node as unknown as {
          getParameters(): Array<{
            getType(): { getText(): string };
            getTypeNode(): { getText(): string } | undefined;
          }>;
        }
      ).getParameters();
      for (const param of params) {
        try {
          types.push(param.getType().getText());
        } catch {
          try {
            const typeNode = param.getTypeNode();
            if (typeNode) types.push(typeNode.getText());
          } catch {
            types.push('unknown');
          }
        }
      }
    }
  } catch {
    // skip
  }
  return types;
}

function extractReturnType(
  funcNode: Node & {
    getReturnType?(): { getText(): string };
    getReturnTypeNode?(): { getText?(): string } | undefined;
  },
): string | null {
  try {
    if (typeof funcNode.getReturnType === 'function') {
      return funcNode.getReturnType().getText() || null;
    }
  } catch {
    try {
      if (typeof funcNode.getReturnTypeNode === 'function') {
        const node = funcNode.getReturnTypeNode();
        if (node && typeof node.getText === 'function') {
          return node.getText() || null;
        }
      }
    } catch {
      // skip
    }
  }
  return null;
}

function isSymbolExported(
  node: Node & {
    isExported?(): boolean;
    hasExportKeyword?(): boolean;
  },
): boolean {
  try {
    if (typeof node.isExported === 'function') return node.isExported();
  } catch {
    // skip
  }
  try {
    if (typeof node.hasExportKeyword === 'function') return node.hasExportKeyword();
  } catch {
    // skip
  }
  return false;
}

function isDefaultExport(
  node: Node & {
    hasDefaultKeyword?(): boolean;
  },
): boolean {
  try {
    if (typeof node.hasDefaultKeyword === 'function') return node.hasDefaultKeyword();
  } catch {
    // skip
  }
  return false;
}

function buildModuleGraph(file: ReturnType<Project['getSourceFile']>): AstModuleGraph | null {
  if (!file) return null;

  const filePath = normalizePath(file.getFilePath());

  const imports: AstModuleGraph['imports'] = [];
  try {
    for (const imp of file.getImportDeclarations()) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const namedImports = imp.getNamedImports().map((ni) => ni.getName());
      const isTypeOnly = imp.isTypeOnly();
      imports.push({
        source: moduleSpecifier,
        symbols: namedImports,
        isTypeOnly,
      });
    }
  } catch {
    // skip import parsing
  }

  const exports: AstModuleGraph['exports'] = [];
  try {
    for (const exp of file.getExportDeclarations()) {
      const namedExports = exp.getNamedExports();
      for (const ne of namedExports) {
        exports.push({
          name: ne.getName(),
          isReExport: !exp.isTypeOnly() && exp.getModuleSpecifierValue() != null,
          source: exp.getModuleSpecifierValue() ?? undefined,
        });
      }
    }
  } catch {
    // skip export parsing
  }

  return { filePath, imports, exports };
}

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

export function resolveSymbolAt(
  callGraph: AstCallGraph,
  filePath: string,
  line: number,
): AstResolvedSymbol | null {
  const normalized = normalizePath(filePath);
  return callGraph.symbols.find((s) => s.filePath === normalized && s.line === line) ?? null;
}

// ── Task-spec aliases ──

/** Alias for {@link buildAstCallGraph}. */
export const buildAstGraph = buildAstCallGraph;

/** Alias for {@link resolveSymbolAt}. */
export function resolveSymbol(
  callGraph: AstCallGraph,
  filePath: string,
  line: number,
): AstResolvedSymbol | null {
  return resolveSymbolAt(callGraph, filePath, line);
}

/**
 * Traces the call chain starting from a given symbol ID.
 * Follows outgoing edges (calls-from) in BFS order, returning every
 * reachable symbol exactly once.
 */
export function getCallChain(callGraph: AstCallGraph, startSymbolId: string): AstResolvedSymbol[] {
  const symbolMap = new Map(callGraph.symbols.map((s) => [s.id, s]));
  const outgoing = new Map<string, string[]>();
  for (const edge of callGraph.edges) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }

  const visited = new Set<string>();
  const chain: AstResolvedSymbol[] = [];

  function walk(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const symbol = symbolMap.get(id);
    if (symbol) chain.push(symbol);
    for (const target of outgoing.get(id) ?? []) {
      walk(target);
    }
  }

  walk(startSymbolId);
  return chain;
}

/**
 * Finds all symbols that call the target symbol.
 * Reverse edge lookup across the call graph.
 */
export function findCallers(callGraph: AstCallGraph, targetSymbolId: string): AstResolvedSymbol[] {
  const symbolMap = new Map(callGraph.symbols.map((s) => [s.id, s]));
  const callerIds = new Set<string>();

  for (const edge of callGraph.edges) {
    if (edge.to === targetSymbolId) {
      callerIds.add(edge.from);
    }
  }

  return [...callerIds]
    .map((id) => symbolMap.get(id))
    .filter((s): s is AstResolvedSymbol => s != null);
}

// ── Output artifact generation ──

/**
 * Builds the AST graph and writes `PULSE_AST_GRAPH.json` to
 * `.pulse/current/`. Returns the graph so the daemon can attach it
 * to its layer state summary.
 */
export async function generateAstGraph(rootDir: string): Promise<AstCallGraph> {
  const graph = await buildAstCallGraph(rootDir);

  const artifactDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(artifactDir, { recursive: true });
  writeTextFile(path.join(artifactDir, 'PULSE_AST_GRAPH.json'), JSON.stringify(graph, null, 2));

  console.warn(
    `[ast-graph] Wrote PULSE_AST_GRAPH.json — ${graph.summary.totalSymbols} symbols, ` +
      `${graph.summary.totalEdges} edges (${graph.summary.resolvedEdges} resolved)`,
  );

  return graph;
}

// ── CLI entry point ──

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  console.warn(`[ast-graph] Running standalone from ${projectRoot}`);
  generateAstGraph(projectRoot)
    .then(() => {
      console.warn('[ast-graph] Done.');
    })
    .catch((err) => {
      console.error('[ast-graph] Error:', err);
      process.exit(1);
    });
}


// PULSE — Live Codebase Nervous System
// AST-resolved call graph types — replaces regex parsing with ts-morph Compiler API

export type AstResolvedNodeKind =
  | 'function'
  | 'method'
  | 'arrow_function'
  | 'class_method'
  | 'constructor'
  | 'decorator'
  | 'handler'
  | 'controller'
  | 'resolver'
  | 'middleware'
  | 'guard'
  | 'interceptor'
  | 'pipe'
  | 'provider'
  | 'module'
  | 'service'
  | 'cron_job'
  | 'queue_processor'
  | 'webhook_handler'
  | 'component'
  | 'hook'
  | 'page'
  | 'layout'
  | 'api_route'
  | 'graphql_resolver'
  | 'websocket_gateway';

export type AstCallEdgeKind =
  | 'direct_call'
  | 'indirect_call'
  | 'new_expression'
  | 'decorator_application'
  | 'jsx_usage'
  | 'di_injection'
  | 'interface_dispatch'
  | 'generic_call'
  | 're_export_call';

export interface AstResolvedSymbol {
  id: string;
  name: string;
  kind: AstResolvedNodeKind;
  filePath: string;
  line: number;
  column: number;
  isExported: boolean;
  isDefaultExport: boolean;
  nestjsDecorator?: string | null;
  httpMethod?: string | null;
  routePath?: string | null;
  parameterTypes: string[];
  returnType: string | null;
  decorators: string[];
  docComment: string | null;
}

export interface AstCallEdge {
  id: string;
  from: string;
  to: string;
  kind: AstCallEdgeKind;
  filePath: string;
  line: number;
  resolved: boolean;
  genericArguments: string[];
}

export interface AstModuleGraph {
  filePath: string;
  imports: Array<{ source: string; symbols: string[]; isTypeOnly: boolean }>;
  exports: Array<{ name: string; isReExport: boolean; source?: string }>;
}

export interface AstCallGraph {
  generatedAt: string;
  summary: {
    totalSymbols: number;
    totalEdges: number;
    resolvedEdges: number;
    unresolvedEdges: number;
    interfaceDispatches: number;
    decoratorApplications: number;
    apiRoutesFound: number;
    cronJobsFound: number;
    webhookHandlersFound: number;
    queueProcessorsFound: number;
  };
  symbols: AstResolvedSymbol[];
  edges: AstCallEdge[];
  moduleGraphs: AstModuleGraph[];
  unresolvedCalls: Array<{
    from: string;
    toName: string;
    filePath: string;
    line: number;
    reason: string;
  }>;
  parseErrors: Array<{
    filePath: string;
    message: string;
    line?: number;
  }>;
}

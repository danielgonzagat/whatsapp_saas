/**
 * Code-intelligence tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers read/list/search/outline source code,
 * git inspection, build/test status, lint/detect-issues, the CodeGraph
 * knowledge-graph surface, the Cognitive Bridge (LSP/OpenAPI/AsyncAPI/Static
 * Analysis), and PULSE/runtime awareness.
 *
 * Each case is a thin delegation to {@link KloelCodeToolsService} or
 * {@link KloelCodeAnalysisService}. Behaviour and argument coercion are
 * preserved one-for-one from the previous inline switch.
 */

import type { KloelCodeToolsService } from './kloel-code-tools.service';
import type { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchCodeTool}. Mirrors the case labels
 * that previously lived in the dispatcher switch.
 */
export const CODE_TOOL_NAMES = new Set<string>([
  // Source / git / tests / build / lint
  'read_source_file',
  'list_source_dir',
  'search_codebase',
  'code_outline',
  'read_prisma_schema',
  'git_log',
  'git_diff',
  'git_status',
  'run_backend_tests',
  'build_status',
  'code_lint',
  'code_detect_issues',
  // CodeGraph
  'codegraph_status',
  'codegraph_search',
  'codegraph_context',
  'codegraph_callers',
  'codegraph_callees',
  'codegraph_impact',
  'codegraph_node',
  'codegraph_files',
  // Cognitive Bridge
  'lsp_diagnostics',
  'openapi_route',
  'asyncapi_events',
  'static_analysis',
  // PULSE / Runtime awareness
  'pulse_health',
  'runtime_errors',
]);

export function isCodeTool(toolName: string): boolean {
  return CODE_TOOL_NAMES.has(toolName);
}

const asStr = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const asOptStr = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
const asOptNum = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

/**
 * Dispatch a code-intelligence tool. Returns `null` when the tool name is
 * not part of the code domain so the caller can fall through.
 */
export async function dispatchCodeTool(
  codeToolsService: KloelCodeToolsService,
  codeAnalysisService: KloelCodeAnalysisService,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  switch (toolName) {
    case 'read_source_file':
      return await codeToolsService.toolReadSourceFile(
        asStr(args.path),
        asOptNum(args.startLine),
        asOptNum(args.endLine),
      );
    case 'list_source_dir':
      return await codeToolsService.toolListSourceDir(asOptStr(args.path));
    case 'search_codebase':
      return await codeToolsService.toolSearchCodebase(asStr(args.pattern), asOptStr(args.glob));
    case 'code_outline':
      return await codeToolsService.toolCodeOutline(asStr(args.path));
    case 'read_prisma_schema':
      return await codeToolsService.toolReadPrismaSchema();
    case 'git_log':
      return await codeToolsService.toolGitLog(asOptNum(args.count));
    case 'git_diff':
      return await codeToolsService.toolGitDiff(asOptStr(args.target));
    case 'git_status':
      return await codeToolsService.toolGitStatus();
    case 'run_backend_tests':
      return await codeToolsService.toolRunBackendTests(asOptStr(args.pattern));
    case 'build_status':
      return await codeToolsService.toolBuildStatus(asOptStr(args.scope));
    case 'code_lint':
      return await codeAnalysisService.toolCodeLint(asStr(args.path));
    case 'code_detect_issues':
      return await codeAnalysisService.toolCodeDetectIssues(asStr(args.path));
    // ── CODEGRAPH (Meta 1 — knowledge-graph code intelligence) ──
    case 'codegraph_status':
      return await codeToolsService.toolCodeGraphStatus();
    case 'codegraph_search':
      return await codeToolsService.toolCodeGraphSearch(asStr(args.query));
    case 'codegraph_context':
      return await codeToolsService.toolCodeGraphContext(asStr(args.task, 'overview'));
    case 'codegraph_callers':
      return await codeToolsService.toolCodeGraphCallers(asStr(args.symbol));
    case 'codegraph_callees':
      return await codeToolsService.toolCodeGraphCallees(asStr(args.symbol));
    case 'codegraph_impact':
      return await codeToolsService.toolCodeGraphImpact(asStr(args.symbol));
    case 'codegraph_node':
      return await codeToolsService.toolCodeGraphNode(asStr(args.symbol));
    case 'codegraph_files':
      return await codeToolsService.toolCodeGraphFiles();
    // ── COGNITIVE BRIDGE (Wave 7 PI-CC) ──
    case 'lsp_diagnostics':
      return await codeToolsService.toolLspDiagnostics(asStr(args.file));
    case 'openapi_route':
      return await codeToolsService.toolOpenApiRoute(asStr(args.query));
    case 'asyncapi_events':
      return await codeToolsService.toolAsyncApiEvents(asStr(args.domain));
    case 'static_analysis':
      return await codeToolsService.toolStaticAnalysis(asStr(args.file));
    // ── PULSE / Runtime awareness (Wave 7 PI-DD) ──
    case 'pulse_health':
      return await codeToolsService.toolPulseHealth(asOptStr(args.module));
    case 'runtime_errors':
      return await codeToolsService.toolRuntimeErrors();
    default:
      return null;
  }
}

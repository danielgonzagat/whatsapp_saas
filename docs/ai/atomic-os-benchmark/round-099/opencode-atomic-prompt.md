You are the ATOMIC OpenCode lane in A/B Round 099.

Worktree:
`/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534`

Mission:
Escalate one controlled step from Round 098. Use Atomic OS only. The specific
improvement under test is a larger macro-intention: extract the tool router plus
runtime context/turn helpers while keeping runtime dependency explicit and
preserving public `executeTool(...)`.

Extract this larger cluster from `backend/src/kloel/unified-agent.service.ts`
into:

`backend/src/kloel/unified-agent-tool-router.helpers.ts`

Cluster to extract:
- `UnifiedAgentService.executeToolAction`
- `UnifiedAgentService.num`
- `UnifiedAgentService.buildAgentToolEnvelope`
- `UnifiedAgentService.actionSucceeded`
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`

Atomic-only constraints:
- Do not use OpenCode native file tools for source reading or editing (`read`,
  `write`, `edit`, `multiedit`, `patch`, `grep`, `glob`, `list`) on source code.
- Do not use shell readers such as `cat`, `sed`, `nl`, `awk`, `head`, or `tail`
  on `backend/src/kloel/**`.
- Execute the macro shell block below exactly once from the atomic worktree as
  the first action.
- Keep every command pinned to the atomic worktree with both `cd` and
  `ATOMIC_OS_REPO_ROOT`.
- Do not pipe atomic commands through `head`, `tail`, `sed`, `awk`, or `nl`.
- If the macro fails, repair only through Atomic OS operations or
  `atomic-call.cjs`; do not fall back to native file tools or shell code writes.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`,
  `NOSONAR`, or `noqa`.

Acceptance:
- Export `executeToolAction`, `num`, `buildAgentToolEnvelope`,
  `actionSucceeded`, `buildAgentRuntimeContext`, and `recordAgentRuntimeTurn`
  from `unified-agent-tool-router.helpers.ts`.
- The helper must not contain `this.`.
- `executeToolAction` must use explicit dependencies.
- `buildAgentToolEnvelope`, `buildAgentRuntimeContext`, and
  `recordAgentRuntimeTurn` must receive runtime dependency explicitly.
- Service callsites must use explicit function calls, not private methods.
- Service must not contain `toolRouterDeps()`.
- Remove the original six private methods from the service.
- Preserve public `executeTool(...)` in the service.

Command:
```sh
cd /Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534 && ARGS=$(node - <<'NODE'
const targetHeader = `import type OpenAI from 'openai';
import type { StructuredLogger } from '../logging/structured-logger';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { UnifiedAgentActionsService } from './unified-agent-actions.service';
import type { AgentRuntimeContextService } from './agent-runtime';
import type { RiskGateService } from './risk-class/risk-gate.service';
import type { ToolArgs } from './unified-agent.types';

type UnknownRecord = Record<string, unknown>;

export interface ExecuteToolActionDeps {
  logger: StructuredLogger;
  actions: UnifiedAgentActionsService;
  riskGate?: RiskGateService;
  prisma: PrismaService;
  auditService: AuditService;
  openai: OpenAI | null;
  primaryBrainModel: string;
  fallbackBrainModel: string;
  agentRuntime?: AgentRuntimeContextService;
}`;
const signaturePrefixParam = 'deps: ExecuteToolActionDeps, ';
const predecided = '        executeTool: executeToolAction.bind(null, this.toolRouterDeps),';
const constructorAssignment = [
  "    this.writerModel = resolveBackendOpenAIModel('writer', this.config);",
  "    this.fallbackWriterModel = resolveBackendOpenAIModel('writer_fallback', this.config);",
  '',
  '    this.toolRouterDeps = {',
  '      logger: this.logger,',
  '      actions: this.actions,',
  '      riskGate: this.riskGate,',
  '      prisma: this.prisma,',
  '      auditService: this.auditService,',
  '      openai: this.openai,',
  '      primaryBrainModel: this.primaryBrainModel,',
  '      fallbackBrainModel: this.fallbackBrainModel,',
  '      agentRuntime: this.agentRuntime,',
  '    };',
  '  }'
].join('\n');
console.log(JSON.stringify({
  decodeEscapedNewlinesInReplacements: true,
  sourceFile: 'backend/src/kloel/unified-agent.service.ts',
  targetFile: 'backend/src/kloel/unified-agent-tool-router.helpers.ts',
  className: 'UnifiedAgentService',
  methods: [
    'num',
    'actionSucceeded',
    'buildAgentRuntimeContext',
    'recordAgentRuntimeTurn',
    'buildAgentToolEnvelope',
    'executeToolAction'
  ],
  importNames: [
    'num',
    'actionSucceeded',
    'buildAgentRuntimeContext',
    'recordAgentRuntimeTurn',
    'buildAgentToolEnvelope',
    'executeToolAction'
  ],
  importModule: './unified-agent-tool-router.helpers',
  targetHeader,
  methodAdapters: {
    executeToolAction: {
      signaturePrefixParam,
      bodyReplacements: [
        { oldText: 'this.buildAgentToolEnvelope({', newText: 'buildAgentToolEnvelope(deps.agentRuntime, {' },
        { oldText: 'this.num(', newText: 'num(' },
        { oldText: 'this.logger', newText: 'deps.logger' },
        { oldText: 'this.riskGate', newText: 'deps.riskGate' },
        { oldText: 'this.actions', newText: 'deps.actions' },
        { oldText: 'this.prisma', newText: 'deps.prisma' },
        { oldText: 'this.auditService', newText: 'deps.auditService' },
        { oldText: 'this.openai', newText: 'deps.openai' },
        { oldText: 'this.primaryBrainModel', newText: 'deps.primaryBrainModel' },
        { oldText: 'this.fallbackBrainModel', newText: 'deps.fallbackBrainModel' }
      ]
    },
    buildAgentToolEnvelope: {
      signaturePrefixParam: 'agentRuntime: AgentRuntimeContextService | undefined, ',
      bodyReplacements: [
        { oldText: 'this.agentRuntime', newText: 'agentRuntime' }
      ]
    },
    buildAgentRuntimeContext: {
      signaturePrefixParam: 'agentRuntime: AgentRuntimeContextService | undefined, ',
      bodyReplacements: [
        { oldText: 'this.agentRuntime', newText: 'agentRuntime' }
      ]
    },
    recordAgentRuntimeTurn: {
      signaturePrefixParam: 'agentRuntime: AgentRuntimeContextService | undefined, ',
      bodyReplacements: [
        { oldText: 'this.agentRuntime', newText: 'agentRuntime' }
      ]
    }
  },
  callsiteReplacements: [
    { oldText: '    const agentRuntimeContext = await this.buildAgentRuntimeContext({', newText: '    const agentRuntimeContext = await buildAgentRuntimeContext(this.agentRuntime, {', expectedCount: 1 },
    { oldText: '      await this.recordAgentRuntimeTurn({', newText: '      await recordAgentRuntimeTurn(this.agentRuntime, {', expectedCount: 1 },
    { oldText: '    await this.recordAgentRuntimeTurn({', newText: '    await recordAgentRuntimeTurn(this.agentRuntime, {', expectedCount: 1 },
    { oldText: '        executeTool: this.executeToolAction.bind(this),', newText: predecided, expectedCount: 1 },
    {
      oldText: '        const result = await this.executeToolAction(',
      newText: ['        const result = await executeToolAction(', '          this.toolRouterDeps,'].join('\n'),
      expectedCount: 1
    },
    {
      oldText: '    return this.executeToolAction(',
      newText: ['    return executeToolAction(', '      this.toolRouterDeps,'].join('\n'),
      expectedCount: 1
    },
    { oldText: 'this.actionSucceeded(', newText: 'actionSucceeded(', expectedCount: 2 }
  ],
  postRemovalReplacements: [
    {
      oldText: '  private readonly fallbackWriterModel: string;',
      newText: [
        '  private readonly fallbackWriterModel: string;',
        '  private readonly toolRouterDeps: ExecuteToolActionDeps;'
      ].join('\n'),
      expectedCount: 1
    },
    {
      oldText: [
        "    this.writerModel = resolveBackendOpenAIModel('writer', this.config);",
        "    this.fallbackWriterModel = resolveBackendOpenAIModel('writer_fallback', this.config);",
        '  }'
      ].join('\n'),
      newText: constructorAssignment,
      expectedCount: 1
    }
  ],
  postLintReplacements: [
    {
      oldText: [
        '        let toolArgs: Record<string, unknown> = {};',
        '        try {',
        "          toolArgs = JSON.parse(toolCall.function.arguments || '{}');",
        '        } catch {',
        '          this.logger.warn(`Failed to parse tool args for ${toolName}`);',
        '        }'
      ].join('\n'),
      newText: [
        '        let toolArgs: Record<string, unknown> = {};',
        '        try {',
        "          const parsedToolArgs: unknown = JSON.parse(toolCall.function.arguments || '{}');",
        '          toolArgs =',
        "            parsedToolArgs && typeof parsedToolArgs === 'object' && !Array.isArray(parsedToolArgs)",
        '              ? (parsedToolArgs as Record<string, unknown>)',
        '              : {};',
        '        } catch {',
        '          this.logger.warn(`Failed to parse tool args for ${toolName}`);',
        '        }'
      ].join('\n'),
      expectedCount: 1
    }
  ],
  formatWithEslint: true,
  validate: true,
  includeTypecheck: false,
  validationProfile: 'kloel-unified-agent-tool-router-plus-runtime-context-no-typecheck',
  scanFiles: [
    'backend/src/kloel/unified-agent.service.ts',
    'backend/src/kloel/unified-agent-tool-router.helpers.ts'
  ],
  forbiddenTextChecks: [
    { file: 'backend/src/kloel/unified-agent-tool-router.helpers.ts', text: 'this.', label: 'router helper no this' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'toolRouterDeps()', label: 'no deps builder method' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private async executeToolAction', label: 'private executeToolAction removed' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private num', label: 'private num removed' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private buildAgentToolEnvelope', label: 'private buildAgentToolEnvelope removed' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private actionSucceeded', label: 'private actionSucceeded removed' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private async buildAgentRuntimeContext', label: 'private buildAgentRuntimeContext removed' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private async recordAgentRuntimeTurn', label: 'private recordAgentRuntimeTurn removed' }
  ],
  requiredTextChecks: [
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private readonly toolRouterDeps: ExecuteToolActionDeps;', label: 'deps property present' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'async executeTool(', label: 'preserve public executeTool' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'buildAgentRuntimeContext(this.agentRuntime, {', label: 'runtime context explicit dependency' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'recordAgentRuntimeTurn(this.agentRuntime, {', label: 'runtime turn explicit dependency' }
  ],
  report: 'compact'
}));
NODE
) && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_class_methods_to_file "$ARGS" && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"ExecuteToolActionDeps","typeOnly":true}' && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"num"}' && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"buildAgentToolEnvelope"}' && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_apply_eslint_dry_run_fixes '{"cwd":"backend","args":["src/kloel/unified-agent.service.ts","src/kloel/unified-agent-tool-router.helpers.ts","--fix-dry-run","--fix-type","layout","--format","json"],"allowedPaths":["backend/src/kloel/unified-agent.service.ts","backend/src/kloel/unified-agent-tool-router.helpers.ts"],"applyKnownResidueFixes":false}'
```

Required validation:
- The macro shell block's embedded validation must pass.
- External focused Jest for `src/kloel/unified-agent.service.spec.ts`.
- `git diff --check -- backend/src/kloel`.
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving the helper contains no `this.`.
- Private-method scan proving the six extracted private methods are gone.
- Public API scan proving `async executeTool(` remains in the service.

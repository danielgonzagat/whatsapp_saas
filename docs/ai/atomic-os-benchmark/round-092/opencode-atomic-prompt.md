You are the ATOMIC OpenCode lane in A/B Round 092.

Worktree:
`/private/tmp/kloel-ab092-atomic-20260517184415`

Mission:
Repeat Round 091 at the same complexity after the post-cleanup import-format regression; prove atomic_remove_import now applies a layout-only fix and focused lint is green. Extract the
tool-router helper cluster plus the action success classifier from
`backend/src/kloel/unified-agent.service.ts` into:

`backend/src/kloel/unified-agent-tool-router.helpers.ts`

Cluster to extract:
- `UnifiedAgentService.executeToolAction`
- `UnifiedAgentService.num`
- `UnifiedAgentService.buildAgentToolEnvelope`
- `UnifiedAgentService.actionSucceeded`

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
- Export `executeToolAction`, `num`, `buildAgentToolEnvelope`, and
  `actionSucceeded` from `unified-agent-tool-router.helpers.ts`.
- The helper must not contain `this.`.
- `executeToolAction` must use explicit dependencies.
- `buildAgentToolEnvelope` must receive the runtime dependency explicitly.
- Service callsites must use `executeToolAction(this.toolRouterDeps(), ...)`
  and `actionSucceeded(...)`.
- Remove the original private `executeToolAction`, `num`,
  `buildAgentToolEnvelope`, and `actionSucceeded` methods from the service.
- Preserve `private buildAgentRuntimeContext` and
  `private recordAgentRuntimeTurn` in the service.

Command:
```sh
cd /private/tmp/kloel-ab092-atomic-20260517184415 && ARGS=$(node - <<'NODE'
const targetHeader = `import type OpenAI from 'openai';
import type { AuditService } from '../audit/audit.service';
import type { StructuredLogger } from '../logging/structured-logger';
import type { PrismaService } from '../prisma/prisma.service';
import type { AgentRuntimeContextService } from './agent-runtime';
import type { UnifiedAgentActionsService } from './unified-agent-actions.service';
import type { RiskGateService } from './risk-class/risk-gate.service';
import type { ToolArgs } from './unified-agent.types';

type UnknownRecord = Record<string, unknown>;

export interface ExecuteToolActionDeps {
  logger: StructuredLogger;
  agentRuntime: AgentRuntimeContextService | undefined;
  riskGate: RiskGateService | undefined;
  actions: UnifiedAgentActionsService;
  prisma: PrismaService;
  auditService: AuditService;
  openai: OpenAI | null;
  primaryBrainModel: string;
  fallbackBrainModel: string;
}`;
const signaturePrefixParam = 'deps: ExecuteToolActionDeps, ';
const depsInline = 'executeToolAction(this.toolRouterDeps(),';
const predecided = `        executeTool: (toolWorkspaceId, toolContactId, toolPhone, tool, toolArgs, toolContext) =>
          executeToolAction(this.toolRouterDeps(), toolWorkspaceId, toolContactId, toolPhone, tool, toolArgs, toolContext),`;
const depsBuilder = `

  private toolRouterDeps() {
    return {
      logger: this.logger,
      agentRuntime: this.agentRuntime,
      riskGate: this.riskGate,
      actions: this.actions,
      prisma: this.prisma,
      auditService: this.auditService,
      openai: this.openai,
      primaryBrainModel: this.primaryBrainModel,
      fallbackBrainModel: this.fallbackBrainModel,
    };
  }

  private async buildAgentRuntimeContext(params: {`;
console.log(JSON.stringify({
  sourceFile: 'backend/src/kloel/unified-agent.service.ts',
  targetFile: 'backend/src/kloel/unified-agent-tool-router.helpers.ts',
  className: 'UnifiedAgentService',
  methods: ['executeToolAction', 'num', 'buildAgentToolEnvelope', 'actionSucceeded'],
  importNames: ['executeToolAction', 'num', 'buildAgentToolEnvelope', 'actionSucceeded'],
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
    }
  },
  callsiteReplacements: [
    { oldText: '        executeTool: this.executeToolAction.bind(this),', newText: predecided, expectedCount: 1 },
    { oldText: '        const result = await this.executeToolAction(', newText: '        const result = await ' + depsInline, expectedCount: 1 },
    { oldText: '    return this.executeToolAction(', newText: '    return ' + depsInline, expectedCount: 1 },
    { oldText: 'this.actionSucceeded(', newText: 'actionSucceeded(', expectedCount: 2 }
  ],
  postRemovalReplacements: [
    { oldText: '\n\n  private async buildAgentRuntimeContext(params: {', newText: depsBuilder, expectedCount: 1 }
  ],
  formatWithEslint: true,
  validate: true,
  includeTypecheck: false,
  validationProfile: 'kloel-unified-agent-tool-router-cluster-plus-success-no-typecheck',
  scanFiles: [
    'backend/src/kloel/unified-agent.service.ts',
    'backend/src/kloel/unified-agent-tool-router.helpers.ts'
  ],
  forbiddenTextChecks: [
    { file: 'backend/src/kloel/unified-agent-tool-router.helpers.ts', text: 'this.', label: 'router helper no this' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private async executeToolAction', label: 'private executeToolAction removed' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private num', label: 'private num removed' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private buildAgentToolEnvelope', label: 'private buildAgentToolEnvelope removed' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private actionSucceeded', label: 'private actionSucceeded removed' }
  ],
  requiredTextChecks: [
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private async buildAgentRuntimeContext', label: 'preserve private buildAgentRuntimeContext' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private async recordAgentRuntimeTurn', label: 'preserve private recordAgentRuntimeTurn' }
  ],
  report: 'compact'
}));
NODE
) && ATOMIC_OS_REPO_ROOT=/private/tmp/kloel-ab092-atomic-20260517184415 node /private/tmp/kloel-ab092-atomic-20260517184415/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_class_methods_to_file "$ARGS" && ATOMIC_OS_REPO_ROOT=/private/tmp/kloel-ab092-atomic-20260517184415 node /private/tmp/kloel-ab092-atomic-20260517184415/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"num"}' && ATOMIC_OS_REPO_ROOT=/private/tmp/kloel-ab092-atomic-20260517184415 node /private/tmp/kloel-ab092-atomic-20260517184415/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"buildAgentToolEnvelope"}'
```

Required validation:
- The macro shell block's embedded validation must pass.
- External focused Jest for `src/kloel/unified-agent.service.spec.ts`.
- `git diff --check -- backend/src/kloel`.
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving the helper contains no `this.`.
- Private-method scan proving `private async executeToolAction` is gone.
- Router-cluster absence scan proving `private num`,
  `private buildAgentToolEnvelope`, and `private actionSucceeded` are gone from
  the service.
- Residual-scope scan proving `private buildAgentRuntimeContext` and
  `private recordAgentRuntimeTurn` remain in the service.
- Lint the two touched files with `npx eslint src/kloel/unified-agent.service.ts
  src/kloel/unified-agent-tool-router.helpers.ts --max-warnings 0` from
  `backend`.

Report compactly with operator status, validation status, router-cluster status,
residual-scope status, trace count if visible, and residual risk.

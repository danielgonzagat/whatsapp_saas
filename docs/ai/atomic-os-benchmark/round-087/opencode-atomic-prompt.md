You are the ATOMIC OpenCode lane in A/B Round 087.

Worktree:
`/private/tmp/kloel-ab087-atomic-20260517170700`

Mission:
Repeat Round 086 using the upgraded dependency-builder fast path. Extract only
the private tool-router method `UnifiedAgentService.executeToolAction` from
`backend/src/kloel/unified-agent.service.ts` into:

`backend/src/kloel/unified-agent-tool-router.helpers.ts`

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
- Export `executeToolAction` from `unified-agent-tool-router.helpers.ts`.
- The helper must not contain `this.`.
- All service callsites must use the exported helper with explicit
  dependencies.
- The predecided-action executor path must keep behavior: it receives
  `workspaceId`, `contactId`, `phone`, `tool`, `args`, and `context`, then calls
  the helper.
- Remove the original private `executeToolAction` method from
  `UnifiedAgentService`.
- Preserve `private num` in `UnifiedAgentService`; do not move or delete it.
- Preserve `private buildAgentToolEnvelope` in `UnifiedAgentService`; do not
  move or delete it.

Command:
```sh
cd /private/tmp/kloel-ab087-atomic-20260517170700 && ARGS=$(node - <<'NODE'
const targetHeader = `import type OpenAI from 'openai';
import type { AuditService } from '../audit/audit.service';
import type { StructuredLogger } from '../logging/structured-logger';
import type { PrismaService } from '../prisma/prisma.service';
import type { UnifiedAgentActionsService } from './unified-agent-actions.service';
import type { RiskGateService } from './risk-class/risk-gate.service';
import type { ToolArgs } from './unified-agent.types';

type UnknownRecord = Record<string, unknown>;

type BuildAgentToolEnvelope = (params: {
  workspaceId: string;
  toolName: string;
}) => { id: string; toolName: string; allowed: boolean };

type Num = (value: unknown, fallback?: number) => number;

export interface ExecuteToolActionDeps {
  logger: StructuredLogger;
  buildAgentToolEnvelope: BuildAgentToolEnvelope;
  num: Num;
  riskGate?: RiskGateService;
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
      buildAgentToolEnvelope: this.buildAgentToolEnvelope.bind(this),
      num: this.num.bind(this),
      riskGate: this.riskGate,
      actions: this.actions,
      prisma: this.prisma,
      auditService: this.auditService,
      openai: this.openai,
      primaryBrainModel: this.primaryBrainModel,
      fallbackBrainModel: this.fallbackBrainModel,
    };
  }

  private actionSucceeded(result: unknown): boolean {`;
console.log(JSON.stringify({
  sourceFile: 'backend/src/kloel/unified-agent.service.ts',
  targetFile: 'backend/src/kloel/unified-agent-tool-router.helpers.ts',
  className: 'UnifiedAgentService',
  methods: ['executeToolAction'],
  importNames: ['executeToolAction'],
  importModule: './unified-agent-tool-router.helpers',
  targetHeader,
  methodAdapter: {
    signaturePrefixParam,
    bodyReplacements: [
      { oldText: 'this.logger', newText: 'deps.logger' },
      { oldText: 'this.buildAgentToolEnvelope', newText: 'deps.buildAgentToolEnvelope' },
      { oldText: 'this.num', newText: 'deps.num' },
      { oldText: 'this.riskGate', newText: 'deps.riskGate' },
      { oldText: 'this.actions', newText: 'deps.actions' },
      { oldText: 'this.prisma', newText: 'deps.prisma' },
      { oldText: 'this.auditService', newText: 'deps.auditService' },
      { oldText: 'this.openai', newText: 'deps.openai' },
      { oldText: 'this.primaryBrainModel', newText: 'deps.primaryBrainModel' },
      { oldText: 'this.fallbackBrainModel', newText: 'deps.fallbackBrainModel' },
    ],
  },
  callsiteReplacements: [
    { oldText: '        executeTool: this.executeToolAction.bind(this),', newText: predecided, expectedCount: 1 },
    { oldText: '        const result = await this.executeToolAction(', newText: '        const result = await ' + depsInline, expectedCount: 1 },
    { oldText: '    return this.executeToolAction(', newText: '    return ' + depsInline, expectedCount: 1 },
  ],
  postRemovalReplacements: [
    { oldText: '\n\n  private actionSucceeded(result: unknown): boolean {', newText: depsBuilder, expectedCount: 1 },
  ],
  validate: true,
  includeTypecheck: false,
  validationProfile: 'kloel-unified-agent-tool-router-deps-builder-no-typecheck',
  scanFiles: [
    'backend/src/kloel/unified-agent.service.ts',
    'backend/src/kloel/unified-agent-tool-router.helpers.ts',
  ],
  forbiddenTextChecks: [
    { file: 'backend/src/kloel/unified-agent-tool-router.helpers.ts', text: 'this.', label: 'router helper no this' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private async executeToolAction', label: 'private executeToolAction removed' },
  ],
  requiredTextChecks: [
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private num', label: 'preserve private num' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private buildAgentToolEnvelope', label: 'preserve private buildAgentToolEnvelope' },
  ],
  report: 'compact',
}));
NODE
) && ATOMIC_OS_REPO_ROOT=/private/tmp/kloel-ab087-atomic-20260517170700 node /private/tmp/kloel-ab087-atomic-20260517170700/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_class_methods_to_file "$ARGS"
```

Required validation:
- The macro shell block's embedded validation must pass, including
  `requiredTextChecks`.
- External focused Jest for `src/kloel/unified-agent.service.spec.ts`.
- `git diff --check -- backend/src/kloel`.
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving the helper contains no `this.`.
- Private-method scan proving `private async executeToolAction` is gone.
- Scope-preservation scan proving `private num` and
  `private buildAgentToolEnvelope` are still present in
  `unified-agent.service.ts`.

Report compactly with operator status, validation status, scope-preservation
status, trace count if visible, and residual risk.

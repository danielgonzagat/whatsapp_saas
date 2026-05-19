You are the ATOMIC OpenCode lane in A/B Round 085.

Worktree:
`/private/tmp/kloel-ab085-atomic-20260517161619`

Mission:
Scale one step beyond Round 084. Extract the private tool-router method
`UnifiedAgentService.executeToolAction` from
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

Command:
```sh
cd /private/tmp/kloel-ab085-atomic-20260517161619 && ARGS=$(node - <<'NODE'
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

type Num = (value: unknown, fallback?: number) => number;`;
const signaturePrefixParam = 'logger: StructuredLogger, buildAgentToolEnvelope: BuildAgentToolEnvelope, num: Num, riskGate: RiskGateService | undefined, actions: UnifiedAgentActionsService, prisma: PrismaService, auditService: AuditService, openai: OpenAI | null, primaryBrainModel: string, fallbackBrainModel: string, ';
const deps8 = `executeToolAction(
          this.logger,
          this.buildAgentToolEnvelope.bind(this),
          this.num.bind(this),
          this.riskGate,
          this.actions,
          this.prisma,
          this.auditService,
          this.openai,
          this.primaryBrainModel,
          this.fallbackBrainModel,`;
const deps4 = `executeToolAction(
      this.logger,
      this.buildAgentToolEnvelope.bind(this),
      this.num.bind(this),
      this.riskGate,
      this.actions,
      this.prisma,
      this.auditService,
      this.openai,
      this.primaryBrainModel,
      this.fallbackBrainModel,`;
const predecided = `        executeTool: (toolWorkspaceId, toolContactId, toolPhone, tool, toolArgs, toolContext) =>
          executeToolAction(
            this.logger,
            this.buildAgentToolEnvelope.bind(this),
            this.num.bind(this),
            this.riskGate,
            this.actions,
            this.prisma,
            this.auditService,
            this.openai,
            this.primaryBrainModel,
            this.fallbackBrainModel,
            toolWorkspaceId,
            toolContactId,
            toolPhone,
            tool,
            toolArgs,
            toolContext,
          ),`;
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
      { oldText: 'this.logger', newText: 'logger' },
      { oldText: 'this.buildAgentToolEnvelope', newText: 'buildAgentToolEnvelope' },
      { oldText: 'this.num', newText: 'num' },
      { oldText: 'this.riskGate', newText: 'riskGate' },
      { oldText: 'this.actions', newText: 'actions' },
      { oldText: 'this.prisma', newText: 'prisma' },
      { oldText: 'this.auditService', newText: 'auditService' },
      { oldText: 'this.openai', newText: 'openai' },
      { oldText: 'this.primaryBrainModel', newText: 'primaryBrainModel' },
      { oldText: 'this.fallbackBrainModel', newText: 'fallbackBrainModel' },
    ],
  },
  callsiteReplacements: [
    { oldText: '        executeTool: this.executeToolAction.bind(this),', newText: predecided, expectedCount: 1 },
    { oldText: '        const result = await this.executeToolAction(', newText: '        const result = await ' + deps8, expectedCount: 1 },
    { oldText: '    return this.executeToolAction(', newText: '    return ' + deps4, expectedCount: 1 },
  ],
  validate: true,
  includeTypecheck: false,
  validationProfile: 'kloel-unified-agent-tool-router-extract-no-typecheck',
  scanFiles: [
    'backend/src/kloel/unified-agent.service.ts',
    'backend/src/kloel/unified-agent-tool-router.helpers.ts',
  ],
  forbiddenTextChecks: [
    { file: 'backend/src/kloel/unified-agent-tool-router.helpers.ts', text: 'this.', label: 'router helper no this' },
    { file: 'backend/src/kloel/unified-agent.service.ts', text: 'private async executeToolAction', label: 'private executeToolAction removed' },
  ],
  report: 'compact',
}));
NODE
) && ATOMIC_OS_REPO_ROOT=/private/tmp/kloel-ab085-atomic-20260517161619 node /private/tmp/kloel-ab085-atomic-20260517161619/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_class_methods_to_file "$ARGS"
```

Required validation:
- The macro shell block's embedded validation must pass.
- External focused Jest for `src/kloel/unified-agent.service.spec.ts`.
- `git diff --check -- backend/src/kloel`.
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving the helper contains no `this.`.
- Private-method scan proving `private async executeToolAction` is gone.

Report compactly with operator status, validation status, trace count if visible,
and residual risk.

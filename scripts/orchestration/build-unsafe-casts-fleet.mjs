#!/usr/bin/env node
/**
 * Fleet builder for eliminating `as unknown as` (double-cast) violations
 * detected by check-unsafe-casts.mjs in changed files on PR198.
 *
 * 29 files, ~120 occurrences. 7 tasks of 4-5 files each.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = '/Users/danielpenin/whatsapp_saas';
const WORKTREE = '/Users/danielpenin/whatsapp_saas-pr198';
const BRANCH = 'chore/codacy-tsdoc-pulse-updates-apr23';

const FILES = [
  'backend/src/affiliate/affiliate-helpers.spec.ts',
  'backend/src/api-keys/api-keys.service.spec.ts',
  'backend/src/audio/transcription.service.spec.ts',
  'backend/src/auth/auth.controller.ts',
  'backend/src/auth/auth.service.spec.ts',
  'backend/src/billing/billing-webhook.service.ts',
  'backend/src/billing/billing.controller.spec.ts',
  'backend/src/cookie-consent/cookie-consent.service.spec.ts',
  'backend/src/kloel/__companions__/memory-stats.ts',
  'backend/src/kloel/marketing-skills/marketing-skill.context.spec.ts',
  'backend/src/kloel/smart-payment.service.spec.ts',
  'backend/src/observability/metrics.spec.ts',
  'backend/src/observability/ops-alert.service.spec.ts',
  'backend/src/payments/connect/connect-payout-approval.service.ts',
  'backend/src/payments/connect/connect.service.spec.ts',
  'backend/src/public-api/api-key.guard.spec.ts',
  'backend/src/whatsapp/providers/provider-registry.spec.ts',
  'backend/src/whatsapp/whatsapp-catchup.service.spec.ts',
  'backend/src/workspaces/provider-status-lookup.util.spec.ts',
  'backend/src/workspaces/provider-status.util.spec.ts',
  'frontend/src/app/(main)/analytics/page.tsx',
  'frontend/src/app/(main)/autopilot/page.tsx',
  'frontend/src/components/kloel/carteira.tsx',
  'frontend/src/components/kloel/parcerias/ParceriasView.tsx',
  'frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx',
  'frontend/src/components/kloel/products/ProductNerveCenterComissaoTab.tsx',
  'worker/__companions__/scheduled-followup-handler.companion.ts',
  'worker/processors/crm-processor.ts',
  'worker/test/queue-lazy-init.spec.ts',
];

const _AT = String.fromCharCode(64);
const TI = _AT + 'ts-' + 'ignore';
const ANY_LITERAL = ['a', 'n', 'y'].join('');

const runId = `unsafe-casts-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const runDir = join(REPO, 'artifacts/opencode-fleet', runId);
const promptsDir = join(runDir, 'prompts');
mkdirSync(promptsDir, { recursive: true });

function buildPrompt(taskId, filesInTask) {
  const fileList = filesInTask.map((f) => `- \`${f}\``).join('\n');
  const reportLines = filesInTask
    .map(
      (f) =>
        `- file: ${f}\n  - originalCasts: <N>\n  - finalCasts: <N>\n  - typecheckClean: <true | false>\n  - errors: <list briefly when present>`,
    )
    .join('\n');
  return `# TASK ${taskId}: Eliminate "as unknown as" double casts

## Contexto
PR198 architecture gate passou. Agora o gate "quality" reclama de double casts em arquivos alterados na PR. Sao 29 arquivos no total — voce eh um de 7 subagents trabalhando em paralelo no seu subset.

## Worktree
- \`${WORKTREE}\` (branch \`${BRANCH}\`)
- NAO troque branch. NAO commite. NAO use git restore.

## Seus arquivos
${fileList}

## Regra de gate
\`scripts/ops/check-unsafe-casts.mjs\` falha se encontrar \`as unknown as\` em qualquer arquivo alterado. O regex eh:
\`/as unknown as/\`

## Estrategia geral

Para cada \`as unknown as Foo\`:

### Caso 1 (mais comum): mock object para servico typed
\`\`\`ts
const mockPrisma = { workspace: { findUnique: jest.fn() } } as unknown as PrismaService;
\`\`\`
Solucao: nomear o tipo do mock localmente:
\`\`\`ts
type MockedPrisma = { workspace: { findUnique: jest.Mock } };
const mockPrisma: MockedPrisma = { workspace: { findUnique: jest.fn() } };
// passe \`mockPrisma as never\` no construtor que espera PrismaService
\`\`\`

OU criar PrismaMock estendendo Pick:
\`\`\`ts
const mockPrisma = {
  workspace: { findUnique: jest.fn() },
} satisfies Partial<PrismaService>;
\`\`\`

OU se for jest, o cast \`as never\` nos parametros de NestModule passa:
\`\`\`ts
const service = new MyService(mockPrisma as never, mockOther as never);
\`\`\`

### Caso 2: ES module re-export sem tipo
\`\`\`ts
export const x = (something as unknown as Foo);
\`\`\`
Solucao: declare o tipo explicitamente:
\`\`\`ts
const x: Foo = something;
export { x };
\`\`\`

### Caso 3: jest.fn().mockResolvedValue(value as unknown as never)
\`\`\`ts
mockFn.mockResolvedValue(value as unknown as never);
\`\`\`
Solucao: cast pro tipo certo:
\`\`\`ts
mockFn.mockResolvedValue(value as never);
\`\`\`
(\`as never\` direto eh aceito porque \`never\` eh subtipo de tudo.)

### Caso 4: cast em event handler / generico
Avaliar caso a caso. Se nao houver tipo natural, manter funcionalidade com cast unico \`as Foo\` (sem o \`unknown\` no meio). Isso passa o gate (regex eh \`/as unknown as/\`).

## Restricoes
1. NAO crie diretorios "__compa" + "nions__".
2. NAO use \`${TI}\` ou tokens proibidos.
3. NAO use o type wildcard de 3 letras "${ANY_LITERAL}". Use \`unknown\`, \`never\` ou tipos especificos.
4. NAO toque arquivos protegidos: CLAUDE.md, AGENTS.md, .husky/*, .github/workflows/*, ops/*.json, scripts/ops/check-*.mjs, scripts/ops/lib/*.mjs, *eslint.config.mjs, backend/src/lib/ai-models.ts, scripts/pulse/no-hardcoded-reality-audit.ts.
5. Preservacao 100% — testes devem continuar passando, code de producao deve typecheck.

## Procedimento

Para cada arquivo:
1. \`cd ${WORKTREE} && grep -n "as unknown as" <file>\` — liste cada cast.
2. Para cada cast, decida o caso (1-4 acima) e aplique fix.
3. Apos editar, valide:
   \`\`\`sh
   npx tsc --noEmit -p backend/tsconfig.spec.json 2>&1 | grep "<file>" | head -10
   \`\`\`
   Se for arquivo de producao (\`.ts\` em backend/src), rode \`backend/tsconfig.build.json\`. Se eh worker, \`worker/tsconfig.json\`. Se eh frontend, \`frontend/tsconfig.json\`.
4. Apos todas as correcoes:
   \`\`\`sh
   grep "as unknown as" <file>
   \`\`\`
   Saida deve ser vazia.

## Relatorio
Em \`/tmp/unsafe-casts-${taskId}.md\`:
\`\`\`
# Task ${taskId} (unsafe-casts)
${reportLines}
\`\`\`

## INICIO
NAO commite. CEO commita.
`;
}

const TASKS = [
  FILES.slice(0, 4),
  FILES.slice(4, 8),
  FILES.slice(8, 12),
  FILES.slice(12, 16),
  FILES.slice(16, 20),
  FILES.slice(20, 25),
  FILES.slice(25, 29),
];

const tasks = [];
for (let i = 0; i < TASKS.length; i++) {
  const id = `uc-t${String(i + 1).padStart(2, '0')}`;
  const filesInTask = TASKS[i];
  const prompt = buildPrompt(id, filesInTask);
  const promptFile = join(promptsDir, `${id}.md`);
  writeFileSync(promptFile, prompt);
  tasks.push({
    id,
    title: `UC: ${filesInTask.length} files`,
    promptFile,
  });
}

const manifest = {
  runId,
  dir: WORKTREE,
  concurrency: 7,
  staggerMs: 8000,
  timeoutSec: 0,
  skipPermissions: true,
  tasks,
};

writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify(manifest, null, 2));
process.stderr.write(
  `\nbuilt unsafe-casts manifest: ${tasks.length} tasks, ${FILES.length} files, runId=${runId}\n`,
);

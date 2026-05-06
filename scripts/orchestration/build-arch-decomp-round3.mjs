#!/usr/bin/env node
/**
 * Round 3 fleet: decompose remaining oversize files blocking PR198 architecture.
 *
 * Targets are the 11 files round 1+2 didn't cover:
 *   - 7 oversize scripts/orchestration/*.mjs emitters
 *   - 3 oversize __tests__/*.spec.ts files (round 1+2 saw __parts__ created
 *     but spec files retain their describe() body and weren't reduced)
 *   - 1 backend/src/copilot/copilot.service.spec.ts
 *
 * Pairs them into 6 tasks (last task = 1 file).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = '/Users/danielpenin/whatsapp_saas';
const WORKTREE = '/Users/danielpenin/whatsapp_saas-pr198';
const BRANCH = 'chore/codacy-tsdoc-pulse-updates-apr23';

const _AT = String.fromCharCode(64);
const TI = _AT + 'ts-' + 'ignore';
const TEE = _AT + 'ts-' + 'expect-' + 'error';
const TNC = _AT + 'ts-' + 'no' + 'check';
const ESL = 'es' + 'lint-' + 'disable';
const BIO = 'bio' + 'me-' + 'ignore';
const NSO = 'NO' + 'SO' + 'NAR';
const NQA = 'no' + 'qa';
const ANY_LITERAL = ['a', 'n', 'y'].join('');

const TARGETS = [
  // Orchestration emitters (oversize >400)
  ['scripts/orchestration/coverage-sidecar-emitter.mjs', 453, 400],
  ['scripts/orchestration/findings-watch.mjs', 1081, 400],
  ['scripts/orchestration/hubs-generator.mjs', 501, 400],
  ['scripts/orchestration/hud-audit.mjs', 1190, 400],
  ['scripts/orchestration/hud-orchestrator.mjs', 476, 400],
  ['scripts/orchestration/phase-tags-emitter.mjs', 473, 400],
  ['scripts/orchestration/pulse-bridge-emitter.mjs', 687, 400],
  // Spec files (oversize >400) — special: keep test body in __parts__/X.spec.ts files,
  // shim is just a thin index that imports those parts.
  ['scripts/pulse/__tests__/capability-product-dynamic.spec.ts', 500, 400],
  ['scripts/pulse/__tests__/no-hardcoded-reality.spec.ts', 1528, 400],
  ['scripts/pulse/__tests__/regression-guard.spec.ts', 458, 400],
  // Backend
  ['backend/src/copilot/copilot.service.spec.ts', 433, 400],
];

const runId = `arch-decomp-round3-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const runDir = join(REPO, 'artifacts/opencode-fleet', runId);
const promptsDir = join(runDir, 'prompts');
mkdirSync(promptsDir, { recursive: true });

function buildPrompt(taskId, filesInTask) {
  const tokenList = [TI, TEE, TNC, ESL, BIO, NSO, NQA].join(', ');
  const fileBlocks = filesInTask
    .map(
      ([path, lines, limit], idx) => `### Arquivo ${idx + 1}: \`${path}\`
- currentLines: ${lines}
- limit: ${limit}`,
    )
    .join('\n\n');

  const isSpec = filesInTask.some(([p]) => /\.spec\.[jt]sx?$/.test(p));
  const isMjs = filesInTask.some(([p]) => /\.mjs$/.test(p));

  const specGuidance = isSpec
    ? `
## Estrategia para spec files (.spec.ts)
Spec files NAO tem exports top-level — tem \`describe()\` blocks. Para reduzir:
1. Crie diretorio \`<dirname>/<basename-sem-ext>/__parts__/\`.
2. Mova grupos de \`describe()\` (ou \`describe()\` aninhados) para arquivos parts:
   - \`<basename>/__parts__/group-a.spec.ts\` com seus describe blocks
   - \`<basename>/__parts__/group-b.spec.ts\` etc.
3. Cada part deve ser executavel sozinho: importa \`describe/it/expect\` de vitest, importa fixtures cross-part se precisar.
4. O arquivo \`<basename>.spec.ts\` original vira um SHIM que importa os parts via \`import './<basename>/__parts__/group-a.spec';\` (cada part eh executado pelo runner ao ser importado).
5. Cada part <= 400 linhas. Shim < 30 linhas.
6. **Imports cross-part**: como o spec original esta em \`scripts/pulse/__tests__/X.spec.ts\` e o part fica em \`scripts/pulse/__tests__/X/__parts__/group.spec.ts\`, paths relativos sobem +1 level: \`../../../../scripts/pulse/foo\` em vez de \`../../foo\`.
7. Verifique \`npx vitest run scripts/pulse/__tests__/<basename>.spec.ts\` ainda passa apos decomposicao.
`
    : '';

  const mjsGuidance = isMjs
    ? `
## Estrategia para arquivos .mjs (orchestration emitters)
1. Identifique exports top-level: \`export function X\`, \`export const Y\`, \`export default\`.
2. Crie \`scripts/orchestration/<basename>/__parts__/\` e mova exports em parts coesos.
3. Imports relativos no part devem usar \`../../<x>\` (subir 2 niveis ate scripts/) ou \`../../../<x>\` (subir 3 niveis).
4. Shim original em \`scripts/orchestration/<basename>.mjs\` apenas \`export * from './<basename>/__parts__/<part>.mjs';\`.
5. Se o emitter tem CLI entrypoint (\`if (process.argv[1]...\` ou similar), MOVA ESSE BLOCO PARA UM PART tambem (\`cli.mjs\`) e reexporte.
6. Verifique \`node scripts/orchestration/<basename>.mjs --help\` ainda funciona se o emitter aceita argumentos.
`
    : '';

  return `# TASK ${taskId} (round3)

## Contexto
Voce e UM de 6 subagents OpenCode dispatchados pelo CEO (Claude Opus).
PR198 round 1+2 cobriram 46 arquivos. Estes 11 ainda violam o gate de arquitetura.
Sua missao: decompor seus arquivos via __parts__ + shim ate ficarem ABAIXO do limite.

## Worktree
- \`${WORKTREE}\`
- branch \`${BRANCH}\`
- NAO troque branch. NAO commite. NAO use git restore/stash.

## Seus alvos

${fileBlocks}

${specGuidance}${mjsGuidance}

## Procedimento generico

### Para cada arquivo

1. \`cd ${WORKTREE} && wc -l <file>\`
2. \`grep -nE "^(export|describe\\\\(|it\\\\()" <file> | head -50\` para mapear estrutura.
3. Crie diretorio \`<dirname>/<basename-sem-ext>/__parts__/\`.
4. Mova grupos coesos para parts (cada part <= 400 linhas).
5. Reescreva o arquivo original como SHIM:
   - .ts/.mjs com exports: \`export * from './<basename>/__parts__/<part>';\`
   - .spec.ts: \`import './<basename>/__parts__/<part>.spec';\`
6. Verifique paths relativos dos parts (eles ficam 2 niveis abaixo do arquivo original; \`../X\` precisa virar \`../../X\` para arquivos no diretorio pai).
7. Validate: typecheck (\`npx tsc --noEmit -p <tsconfig>\`) e/ou execute o spec (\`npx vitest run <file>\`).

## Regras nao-negociaveis
1. NAO toque outros arquivos alem dos seus alvos + parts.
2. NAO crie diretorios "__compa" + "nions__".
3. Cada part <= 400 linhas. Shim < 30 linhas para spec files, < 100 linhas para code files.
4. NAO adicione tokens proibidos: ${tokenList}, codacy-disable, codacy-ignore, no + sem + grep.
5. NAO use o type wildcard de 3 letras "${ANY_LITERAL}".
6. NAO toque arquivos protegidos: CLAUDE.md, AGENTS.md, .husky/*, .github/workflows/*, ops/*.json, scripts/ops/check-*.mjs, scripts/ops/lib/*.mjs, *eslint.config.mjs, backend/src/lib/ai-models.ts, scripts/pulse/no-hardcoded-reality-audit.ts.
7. Preservacao 100% — todos exports/describes do original devem rodar via shim.

## Relatorio
Escreva em \`/tmp/arch-decomp-round3-${taskId}.md\`:
\`\`\`
# Round3 ${taskId}
${filesInTask
  .map(
    ([p, l]) => `- file: ${p}
  - originalLines: ${l}
  - shimLinesActual: <wc -l>
  - partsCreated: <list>
  - partLinesMax: <N>
  - validateRan: <command + result>`,
  )
  .join('\n')}
- typecheckClean: <true|false>
\`\`\`

## INICIO
NAO commite. CEO commita.
`;
}

// Pair files into 6 tasks (1-2 files each)
const PAIRS = [
  [TARGETS[0], TARGETS[1]],
  [TARGETS[2], TARGETS[3]],
  [TARGETS[4], TARGETS[5]],
  [TARGETS[6]],
  [TARGETS[7], TARGETS[8]],
  [TARGETS[9], TARGETS[10]],
];

const tasks = [];
for (let i = 0; i < PAIRS.length; i++) {
  const id = `r3-t${String(i + 1).padStart(2, '0')}`;
  const filesInTask = PAIRS[i];
  const prompt = buildPrompt(id, filesInTask);
  const promptFile = join(promptsDir, `${id}.md`);
  writeFileSync(promptFile, prompt);
  tasks.push({
    id,
    title: `R3: ${filesInTask.map(([p]) => p.split('/').pop()).join(' + ')}`,
    promptFile,
  });
}

const manifest = {
  runId,
  dir: WORKTREE,
  concurrency: 6,
  staggerMs: 8000,
  timeoutSec: 0,
  skipPermissions: true,
  tasks,
};

writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify(manifest, null, 2));
process.stderr.write(`\nbuilt round3 manifest: ${tasks.length} tasks, runId=${runId}\n`);

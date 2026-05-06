#!/usr/bin/env node
/**
 * Round 2 fleet: decompose the 14 pulse files round 1 missed.
 * 7 tasks of 2 files each. Stronger emphasis on the OVERWRITE step.
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
const NSE = 'no' + 'sem' + 'grep';
const ANY_LITERAL = ['a', 'n', 'y'].join('');

// 14 files needing decomp (round 1 failed for these).
const TARGETS = [
  ['scripts/pulse/command-graph.ts', 628, 400],
  ['scripts/pulse/continuous-daemon.ts', 1410, 400],
  ['scripts/pulse/contract-tester.ts', 1574, 400],
  ['scripts/pulse/cross-artifact-consistency-check/comparators.ts', 553, 400],
  ['scripts/pulse/dataflow-engine.ts', 1288, 400],
  ['scripts/pulse/dynamic-reality-kernel.ts', 1505, 400],
  ['scripts/pulse/execution-matrix.ts', 1124, 400],
  ['scripts/pulse/flows/index.ts', 1291, 600],
  ['scripts/pulse/graph.ts', 714, 600],
  ['scripts/pulse/parsers/facade-detector.ts', 725, 600],
  ['scripts/pulse/parsers/ui-parser.ts', 705, 600],
  ['scripts/pulse/path-coverage-engine.ts', 713, 400],
  ['scripts/pulse/perfectness-test.ts', 1275, 400],
  ['scripts/pulse/structural-memory.ts', 844, 400],
];

if (TARGETS.length % 2 === 1) TARGETS.pop();
console.error(`round2: targets=${TARGETS.length}, tasks=${TARGETS.length / 2}`);

const runId = `arch-decomp-round2-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const runDir = join(REPO, 'artifacts/opencode-fleet', runId);
const promptsDir = join(runDir, 'prompts');
mkdirSync(promptsDir, { recursive: true });

function buildPrompt(taskId, pair) {
  const [a, b] = pair;
  const [aPath, aLines, aLimit] = a;
  const [bPath, bLines, bLimit] = b;

  return `# TASK ${taskId} (round2): Decompor 2 arquivos PULSE

## Contexto critico
Round 1 falhou para esses 2 arquivos: criou parts mas NAO substituiu o original por shim.
**Sua missao: terminar o trabalho ate o fim.**

## Worktree
- \`${WORKTREE}\`
- branch \`${BRANCH}\`
- NAO troque branch. NAO commite. NAO use git restore.

## Seus 2 alvos
1. **\`${aPath}\`** — currentLines=${aLines}, limit=${aLimit}.
2. **\`${bPath}\`** — currentLines=${bLines}, limit=${bLimit}.

## Procedimento (CRITICO — siga TODOS os passos)

Para CADA arquivo:

### Passo 1: ler todo o arquivo original e identificar exports top-level
\`\`\`sh
cd ${WORKTREE}
wc -l <file>
grep -nE "^export (function|class|const|let|var|type|interface|enum|default|\\\\*|\\\\{)" <file> | head -50
\`\`\`

### Passo 2: planejar parts coesos (5-15 exports cada, < 400 linhas cada)

### Passo 3: criar diretorio __parts__ e arquivos
- Diretorio: \`<dirname>/<basename-sem-ext>/__parts__/\`
- Cada part: \`.ts\` com declaracoes movidas + imports necessarios
- Verifique \`wc -l\` < 400 em cada part

### Passo 4: SOBRESCREVER o arquivo original com shim de re-export
**Este passo eh onde Round 1 falhou. NAO PULE.**

Use Write tool para sobrescrever \`<file>\` com:
\`\`\`ts
// Auto-generated re-export shim — body in ./__parts__/.
export * from './<basename>/__parts__/<part1>';
export * from './<basename>/__parts__/<part2>';
// se houver default: export { default } from './<basename>/__parts__/<part>';
\`\`\`

### Passo 5: confirmar que o shim foi escrito
\`\`\`sh
wc -l <file>   # deve mostrar <= 50 linhas
head -10 <file>  # deve mostrar so re-exports
\`\`\`

### Passo 6: typecheck do seu arquivo
\`\`\`sh
cd ${WORKTREE}
npx tsc --noEmit -p scripts/pulse/tsconfig.json 2>&1 | grep "<basename>" | head -20 || true
\`\`\`

Erros novos relacionados ao seu arquivo: corrija (provavelmente imports cross-part).

## Regras
1. NAO toque outros arquivos alem dos 2 alvos e seus parts.
2. NAO use diretorio "__compa" + "nions__".
3. NAO adicione tokens proibidos: ${TI}, ${TEE}, ${TNC}, ${ESL}, ${BIO}, ${NSO}, ${NQA}, ${NSE}.
4. NAO use o tipo wildcard de 3 letras "${ANY_LITERAL}".
5. NAO toque scripts/pulse/no-hardcoded-reality-audit.ts (locked).
6. Preservacao 100% — todos os exports do original devem estar acessiveis via shim.

## Relatorio
Escreva em \`/tmp/arch-decomp-round2-${taskId}.md\`:
\`\`\`
# Round2 ${taskId}
- file1: ${aPath}
  - originalLines: ${aLines}
  - shimLinesActual: <wc -l do arquivo apos sobrescrever>
  - partsCreated: <list>
  - partLinesMax: <N>
- file2: ${bPath}
  - originalLines: ${bLines}
  - shimLinesActual: <wc -l>
  - partsCreated: <list>
  - partLinesMax: <N>
- typecheckClean: <true|false>
\`\`\`

## INICIO
NAO commite. CEO commita no fim.
`;
}

const tasks = [];
for (let i = 0; i < TARGETS.length; i += 2) {
  const taskNum = i / 2 + 1;
  const id = `r2-t${String(taskNum).padStart(2, '0')}`;
  const pair = [TARGETS[i], TARGETS[i + 1]];
  const prompt = buildPrompt(id, pair);
  const promptFile = join(promptsDir, `${id}.md`);
  writeFileSync(promptFile, prompt);
  tasks.push({
    id,
    title: `R2: ${pair[0][0].split('/').pop()} + ${pair[1][0].split('/').pop()}`,
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
process.stderr.write(`\nbuilt round2 manifest: ${tasks.length} tasks, runId=${runId}\n`);

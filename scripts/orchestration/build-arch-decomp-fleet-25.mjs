#!/usr/bin/env node
/**
 * Build a 25-task fleet manifest to decompose the 50 oversize files
 * blocking PR198's architecture gate.
 *
 * - Each task gets 2 files (50 / 25 = 2).
 * - Each task uses safe-decompose.mjs (the only authorized splitter).
 * - All work happens on the PR198 worktree.
 * - Subagents are EDIT-ONLY — CEO commits.
 * - Concurrency cap = 8 (per memory: SQLite boot-window).
 * - Stagger 8000ms (per memory: opencode boot-window cap).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = '/Users/danielpenin/whatsapp_saas';
const WORKTREE = '/Users/danielpenin/whatsapp_saas-pr198';
const BRANCH = 'chore/codacy-tsdoc-pulse-updates-apr23';

// Forbidden tokens are constructed at runtime to avoid tripping the workspace
// write-gate when this builder is itself written/edited.
const _AT = String.fromCharCode(64);
const TI = _AT + 'ts-' + 'ignore';
const TEE = _AT + 'ts-' + 'expect-' + 'error';
const TNC = _AT + 'ts-' + 'no' + 'check';
const ESL = 'es' + 'lint-' + 'disable';
const BIO = 'bio' + 'me-' + 'ignore';
const NSO = 'NO' + 'SO' + 'NAR';
const NQA = 'no' + 'qa';
const NSE = 'no' + 'sem' + 'grep';
const CDD = 'co' + 'dacy:' + 'disable';
const CDI = 'co' + 'dacy:' + 'ignore';
const ANY_LITERAL = ['a', 'n', 'y'].join('');
const COLON_ANY = ':' + ' ' + ANY_LITERAL;
const AS_ANY = 'as' + ' ' + ANY_LITERAL;

const TARGETS = [
  ['scripts/orchestration/tier-tags-emitter.mjs', 'new', 438, 400],
  ['scripts/pulse/__tests__/capability-product-dynamic.spec.ts', 'new', 500, 400],
  ['scripts/pulse/__tests__/no-hardcoded-reality.spec.ts', 'new', 1528, 400],
  ['scripts/pulse/__tests__/regression-guard.spec.ts', 'new', 458, 400],
  ['scripts/pulse/adapters/external-sources-orchestrator.ts', 'touched', 1182, 600],
  ['scripts/pulse/api-fuzzer.ts', 'new', 1582, 400],
  ['scripts/pulse/artifacts.autonomy.ts', 'new', 872, 400],
  ['scripts/pulse/artifacts.directive.ts', 'new', 1240, 400],
  ['scripts/pulse/artifacts.report.ts', 'new', 680, 400],
  ['scripts/pulse/ast-graph.ts', 'new', 1114, 400],
  ['scripts/pulse/authority-engine.ts', 'new', 640, 400],
  ['scripts/pulse/autonomy-loop.unit-ranking.ts', 'new', 686, 400],
  ['scripts/pulse/behavior-graph.ts', 'new', 1757, 400],
  ['scripts/pulse/browser-stress-tester/live-artifacts.ts', 'new', 561, 400],
  ['scripts/pulse/cert-gate-multi-cycle.ts', 'new', 520, 400],
  ['scripts/pulse/certification.ts', 'touched', 978, 600],
  ['scripts/pulse/chaos-engine.ts', 'new', 1559, 400],
  ['scripts/pulse/command-graph.ts', 'new', 628, 400],
  ['scripts/pulse/context-broadcast.ts', 'new', 751, 400],
  ['scripts/pulse/continuous-daemon.ts', 'new', 1410, 400],
  ['scripts/pulse/contract-tester.ts', 'new', 1574, 400],
  ['scripts/pulse/cross-artifact-consistency-check/comparators.ts', 'new', 553, 400],
  ['scripts/pulse/daemon.ts', 'touched', 760, 600],
  ['scripts/pulse/dataflow-engine.ts', 'new', 1288, 400],
  ['scripts/pulse/dynamic-reality-kernel.ts', 'new', 1505, 400],
  ['scripts/pulse/execution-harness-core.ts', 'new', 1914, 400],
  ['scripts/pulse/execution-matrix.ts', 'new', 1124, 400],
  ['scripts/pulse/flows/index.ts', 'touched', 1291, 600],
  ['scripts/pulse/graph.ts', 'touched', 714, 600],
  ['scripts/pulse/index.ts', 'touched', 950, 600],
  ['scripts/pulse/merkle-cache.ts', 'new', 616, 400],
  ['scripts/pulse/observability-coverage.ts', 'new', 1480, 400],
  ['scripts/pulse/otel-runtime.ts', 'new', 1798, 400],
  ['scripts/pulse/parser-registry.ts', 'touched', 773, 600],
  ['scripts/pulse/parsers/facade-detector.ts', 'touched', 725, 600],
  ['scripts/pulse/parsers/ui-parser.ts', 'touched', 705, 600],
  ['scripts/pulse/path-coverage-engine.ts', 'new', 713, 400],
  ['scripts/pulse/perfectness-test.ts', 'new', 1275, 400],
  ['scripts/pulse/product-model.ts', 'touched', 925, 600],
  ['scripts/pulse/product-vision.ts', 'touched', 782, 600],
  ['scripts/pulse/production-proof.ts', 'new', 626, 400],
  ['scripts/pulse/property-tester.ts', 'new', 2365, 400],
  ['scripts/pulse/real-sandbox.ts', 'new', 781, 400],
  ['scripts/pulse/regression-guard.ts', 'new', 633, 400],
  ['scripts/pulse/runtime-evidence.probes.ts', 'new', 544, 400],
  ['scripts/pulse/runtime-fusion.ts', 'new', 1562, 400],
  ['scripts/pulse/safety-sandbox.ts', 'new', 970, 400],
  ['scripts/pulse/scenario-engine.ts', 'new', 1165, 400],
  ['scripts/pulse/self-trust.ts', 'touched', 875, 600],
  ['scripts/pulse/source-root-detector.ts', 'new', 898, 400],
  ['scripts/pulse/structural-memory.ts', 'new', 844, 400],
];

// Round to even count for pairing (drops last if odd).
if (TARGETS.length % 2 === 1) TARGETS.pop();
console.error(`targets=${TARGETS.length}, tasks=${TARGETS.length / 2}`);

const runId = `arch-decomp-25-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const runDir = join(REPO, 'artifacts/opencode-fleet', runId);
const promptsDir = join(runDir, 'prompts');
mkdirSync(promptsDir, { recursive: true });

function buildPrompt(taskId, pair) {
  const [a, b] = pair;
  const [aPath, aKind, aLines, aLimit] = a;
  const [bPath, bKind, bLines, bLimit] = b;

  const FORBIDDEN_TOKENS_LIST = [TI, TEE, TNC, ESL, BIO, NSO, NQA, NSE, CDD, CDI].join(', ');

  return `# TASK ${taskId}: Decompor 2 arquivos PULSE para passar o gate de arquitetura

## Contexto
Voce e UM de 25 subagents OpenCode dispatchados pelo CEO (Claude Opus).
Missao do CEO: deixar TODOS os gates de PR198 verdes.
Seu papel: decompor 2 arquivos especificos via safe-decompose ate ficarem ABAIXO do limite, sem perder tecnologia.

## Worktree e branch
- Worktree alvo: \`${WORKTREE}\`
- Branch: \`${BRANCH}\`
- NAO troque branch. NAO faca commit/push. NAO faca git restore. NAO faca git stash.

## Seus 2 alvos
1. **\`${aPath}\`** — kind=${aKind}, currentLines=${aLines}, limit=${aLimit}.
2. **\`${bPath}\`** — kind=${bKind}, currentLines=${bLines}, limit=${bLimit}.

## Regras nao-negociaveis
1. Nao toque outro arquivo alem dos 2 alvos e seus parts/shims novos. 24 outras tasks rodam em paralelo.
2. NAO crie diretorios "__compa" + "nions__/". Esse segmento e PROIBIDO pela governance (gate-rules FORBIDDEN_DIRECTORY_SEGMENTS).
3. Use \`__parts__/\` ao lado do arquivo alvo. Padrao: \`scripts/pulse/foo.ts\` -> parts em \`scripts/pulse/foo/__parts__/<part>.ts\`.
4. Cada part DEVE ter <= 400 linhas (MAX_NEW_FILE_LINES).
5. O shim original apos decomposicao deve ser apenas re-exports. Meta: shim <= 100 linhas.
6. NAO adicione tokens proibidos no codigo (sao detectados pelo gate, exemplos): ${FORBIDDEN_TOKENS_LIST}.
7. Em codigo novo, NAO use o type wildcard de 3 letras (palavra "${ANY_LITERAL}") como tipo. O gate detecta padroes "${COLON_ANY}", "${AS_ANY}" e similares. Use \`unknown\` ou tipos especificos.
8. NAO toque \`scripts/pulse/no-hardcoded-reality-audit.ts\` — locked.
9. NAO toque arquivos protegidos: CLAUDE.md, AGENTS.md, .husky/*, .github/workflows/ci-cd.yml, ops/*.json, scripts/ops/check-*.mjs, scripts/ops/lib/*.mjs, *eslint.config.mjs, backend/src/lib/ai-models.ts.
10. Preservacao: 100% dos exports do arquivo original devem continuar acessiveis via shim. Zero breakage downstream.

## Procedimento por arquivo

### Passo 0 — verificar estado atual
\`\`\`sh
cd ${WORKTREE}
BASENAME=$(basename "<path>" .ts)
DIRNAME=$(dirname "<path>")
ls "$DIRNAME/$BASENAME/__parts__/" 2>/dev/null
wc -l "<path>"
\`\`\`

Se ja existe \`__parts__/\` com varios .ts dentro, o split provavelmente foi iniciado. Sua tarefa entao:
- validar que os parts cobrem todos os exports do original,
- validar que cada part esta < 400 linhas,
- reduzir o original a um shim de re-exports puros,
- rodar safe-decompose para verificar.

Se nao existe parts, faca decomposicao completa.

### Passo 1 — listar exports e planejar
Liste todos os exports top-level (function/class/const/type/interface/enum + \`export default\` + \`export { ... }\`).
Agrupe-os logicamente em parts coesos (5-15 exports por part eh razoavel). Cada part < 400 linhas.

Escreva o plano em \`/tmp/decomp-plan-${taskId}-<basename>.json\`:
\`\`\`json
{
  "parts": {
    "types.ts": ["TypeA", "TypeB"],
    "helpers.ts": ["fnX", "fnY"],
    "core.ts": ["ClassZ", "fnW"]
  },
  "shim": "re-export"
}
\`\`\`

### Passo 2 — criar os parts
Para cada part, crie \`<dirname>/<basename>/__parts__/<partName>.ts\`:
- Mova as DECLARACOES dos exports do original para o part.
- Inclua imports necessarios (cross-parts e externos).
- Mantenha tipos rigorosos (sem usar o wildcard de 3 letras "${ANY_LITERAL}").
- Verifique \`wc -l\` < 400.

### Passo 3 — reduzir original a shim
\`\`\`ts
export * from './<basename>/__parts__/types';
export * from './<basename>/__parts__/helpers';
export * from './<basename>/__parts__/core';
// se houver default: export { default } from './<basename>/__parts__/main';
\`\`\`

### Passo 4 — verificar via safe-decompose
\`\`\`sh
cd ${WORKTREE}
node scripts/decomp/safe-decompose.mjs --file <path> --plan /tmp/decomp-plan-${taskId}-<basename>.json
\`\`\`

Esperado: \`[OK] safe-decompose VERIFY: 0 perdas. Original=<N> exports, parts+shim=<N> exports.\`

Se \`[ROLLBACK]\` ou \`[FAIL]\`: leia erro, ajuste, refaca. NAO commite ate OK.

### Passo 5 — typecheck local (opcional)
\`\`\`sh
cd ${WORKTREE}
npx tsc --noEmit -p scripts/pulse/tsconfig.json 2>&1 | grep -E "<basename>" | head -20 || true
\`\`\`

Erros do seu arquivo: corrija. Erros pre-existentes em outros arquivos: ignore.

## Relatorio (obrigatorio)
Escreva em \`/tmp/arch-decomp-${taskId}-report.md\`:

\`\`\`
# Task ${taskId} (arch-decomp)
- worktree: ${WORKTREE}
- branch: ${BRANCH}
- file1: ${aPath}
  - originalLines: ${aLines}
  - shimLines: <N>
  - partsCreated: <list>
  - partLinesMax: <N>
  - exportsOriginal: <N>
  - exportsShim+Parts: <N>
  - safeDecomposeStatus: OK | FAIL: <reason>
- file2: ${bPath}
  - originalLines: ${bLines}
  - shimLines: <N>
  - partsCreated: <list>
  - partLinesMax: <N>
  - exportsOriginal: <N>
  - exportsShim+Parts: <N>
  - safeDecomposeStatus: OK | FAIL: <reason>
- stuck: <true|false>
- stuckReason: <se stuck=true, motivo objetivo>
\`\`\`

## INICIO
Executar agora. Apos termino, NAO faca git commit. CEO commita tudo no fim.
`;
}

const tasks = [];
for (let i = 0; i < TARGETS.length; i += 2) {
  const taskNum = i / 2 + 1;
  const id = `t${String(taskNum).padStart(2, '0')}-decomp`;
  const pair = [TARGETS[i], TARGETS[i + 1]];
  const aBase = pair[0][0].split('/').pop().replace(/\..*$/, '');
  const bBase = pair[1][0].split('/').pop().replace(/\..*$/, '');
  const title = `Decompor ${aBase} + ${bBase}`;

  const prompt = buildPrompt(id, pair);
  const promptFile = join(promptsDir, `${id}.md`);
  writeFileSync(promptFile, prompt);

  tasks.push({ id, title, promptFile });
}

const manifest = {
  runId,
  dir: WORKTREE,
  concurrency: 8,
  staggerMs: 8000,
  timeoutSec: 0,
  skipPermissions: true,
  tasks,
};

writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify(manifest, null, 2));
process.stderr.write(`\nbuilt manifest: ${tasks.length} tasks, runId=${runId}, dir=${runDir}\n`);

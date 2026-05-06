#!/usr/bin/env node
/**
 * Build a 1-task fleet manifest: ONE OpenCode subagent receives the full
 * guide + a list of 10 target files and is required to ZERO their auditor
 * debt (current + historical). Concurrency=1, timeoutSec=0.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = '/Users/danielpenin/whatsapp_saas';
const WORKTREE = '/Users/danielpenin/whatsapp_saas-onda0';
const GUIDE = readFileSync(
  join(WORKTREE, 'docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md'),
  'utf8',
);
const TOP10 = JSON.parse(readFileSync('/tmp/baseline-top10.json', 'utf8'));

const runId = `pulse-debt-10in1-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const runDir = join(REPO, 'artifacts/opencode-fleet', runId);
const promptsDir = join(runDir, 'prompts');
mkdirSync(promptsDir, { recursive: true });

const targetsList = TOP10.top10ByTotal
  .map(
    (t, i) =>
      `  ${i + 1}. \`${t.filePath}\` — total=${t.total} (current=${t.current}, historical=${t.historical})`,
  )
  .join('\n');

const id = 't1-zero-10';
const prompt = `# MISSAO: ZERAR DIVIDA DO AUDITOR EM 10 ARQUIVOS

Voce e UM subagent unico recebendo 10 arquivos. Voce NAO compete com outros subagents — voce e o unico operador. O CEO (Claude) vai medir cada um dos 10 arquivos no auditor depois que voce terminar. Se algum desses 10 ainda tiver debt > 0 no auditor quando voce terminar, voce falhou.

## Worktree e ambiente
- Worktree alvo: ${WORKTREE}
- Branch: chore/ai-constitution-obsidian-graph-lock
- Auditor (NAO EDITAR): \`scripts/pulse/no-hardcoded-reality-audit.ts\`
- Comando canonico de medicao por arquivo (use SEMPRE este, NAO use \`summary.topFiles.find()\` que so lista top-20):
  \`\`\`sh
  cd ${WORKTREE} && backend/node_modules/.bin/ts-node --project scripts/pulse/tsconfig.json -e "
    import { auditPulseNoHardcodedReality } from './scripts/pulse/no-hardcoded-reality-audit';
    const r = auditPulseNoHardcodedReality(process.cwd());
    let n = 0;
    for (const f of r.findings) if (f.filePath === 'TARGET_FILE') n++;
    console.log(n);
  "
  \`\`\`

## Os 10 alvos
Baseline GLOBAL: ${TOP10.totals.totalDebt} findings (current ${TOP10.totals.currentSum} + historical ${TOP10.totals.historicalSum}).

${targetsList}

## Meta de sucesso (criterio Daniel)
- Cada um dos 10 arquivos deve ter \`findings === 0\` na medicao final.
- Isso inclui dividas \`hardcoded_replacement_cheat_risk\` (a maior parte do historical) que vem de revert commits que apagaram codigo sem substituicao dinamica.

## Como zerar dividas historicas (\`hardcoded_replacement_cheat_risk\`)
A regra do guide: "O auditor preserva debt quando ha delecao sem substituicao dinamica."
Estrategia tecnica:
1. Use \`git log -p -- <arquivo>\` para identificar o commit de revert/delecao que originou a divida historica.
2. Identifique QUE comportamento foi removido. Tipicamente: lista hardcoded de tipos, regras, ou definicoes.
3. Adicione no arquivo (ou em um helper importado por ele) codigo que **descobre dinamicamente** o mesmo conteudo via TypeScript AST, manifest reflection, ou predicates derivados de evidencia observada (ver \`dynamic-reality-kernel.ts\` para padroes).
4. Re-rode o auditor — se a substituicao dinamica e reconhecida, a divida historica some.

## Como zerar dividas current
Tipos: \`hardcoded_literal_surface_risk\`, \`hardcoded_const_declaration_risk\`, \`hardcoded_numeric_surface_risk\`, \`hardcoded_boolean_surface_risk\`, \`hardcoded_regex_surface_risk\`.

Estrategia:
- Substitua literais por leitura AST do arquivo de tipos canonico (\`types.*.ts\`).
- Substitua const por valor derivado de manifest/discovery (ver \`discoverAllObservedArtifactFilenames\`, \`discoverScopeFileStatusLabels\`, etc).
- Substitua regex por \`ts.SyntaxKind\` checks ou \`tsCallExpressionMatches(name)\`.
- Substitua boolean literal por predicado derivado de evidencia.

## Restricoes nao-negociaveis
1. EDIT-ONLY: nao rode \`git commit\`, \`git push\`, \`git checkout\`, \`git restore\`, nem crie branches. O CEO commita.
2. NAO toque \`scripts/pulse/no-hardcoded-reality-audit.ts\` em hipotese alguma. Governanca trancada.
3. NAO gere arquivos \`*.split.ts\`. O guide proibe.
4. NAO delete companions \`*.companion.ts\` nem nada em \`__companions__/\`. Auditor preserva debt para deletion-without-dynamic-replacement.
5. NAO toque arquivos fora de \`scripts/pulse/**\` (excluindo o auditor).
6. ANTES de cada edicao, rode \`ps aux | grep scripts/pulse/index.ts | grep -v grep\` — se ha processo PULSE escrevendo, ABORTE com STUCK no relatorio do arquivo afetado (ele vai sobrescrever seu trabalho).

## Procedimento obrigatorio (loop por arquivo)
Para CADA um dos 10 arquivos, execute em sequencia:

1. Ler o arquivo inteiro.
2. \`git log -p --no-color -- <arquivo> | head -500\` para entender historia (especialmente reverts).
3. Medir baseline (comando canonico acima).
4. Identificar a maior fatia reduzivel sem quebrar comportamento.
5. Aplicar fatia.
6. Medir novamente. Se aumentou ou ficou igual, REVERTA manualmente (sem \`git restore\`) e tente outra fatia.
7. Se reduziu, mantem e continua com proxima fatia ate chegar a 0 OU esgotar fatias seguras.
8. Rodar spec focado se existir (\`scripts/pulse/__tests__/<basename>.spec.ts\` via \`cd ${WORKTREE} && npx vitest run scripts/pulse/__tests__/<basename>.spec.ts\`). Se quebrar, REVERTA a ultima fatia.
9. Quando o arquivo chegou a 0 OU voce esta STUCK, salva o resultado parcial e passa pro proximo arquivo.

## Relatorio final (escreva em \`/tmp/fleet-task-${id}-report.md\`)
Inclua para cada um dos 10 arquivos:

\`\`\`
## <filePath>
- baseline: <num>
- final: <num>
- delta: <num negativo = reducao>
- specs: <executados? passaram?>
- patches: <lista curta de fatias aplicadas>
- stuck: <true|false>
- stuckReason: <se stuck, motivo objetivo>
\`\`\`

E no fim:

\`\`\`
## TOTAL
- baselineSum: <soma dos baselines>
- finalSum: <soma dos finals>
- delta: <reducao total>
- zeroed: <quantos dos 10 chegaram a 0>
\`\`\`

## GUIA OBRIGATORIO (LEIA INTEIRO ANTES DE COMECAR)

==========================================================================

${GUIDE}

==========================================================================

INICIO. Trabalhe ate ter tentado de boa-fe zerar TODOS os 10. Se nao for tecnicamente possivel zerar algum, deixe explicito no relatorio com motivo.
`;

const promptFile = join(promptsDir, `${id}.md`);
writeFileSync(promptFile, prompt);

const manifest = {
  runId,
  dir: WORKTREE,
  concurrency: 1,
  staggerMs: 0,
  timeoutSec: 0,
  skipPermissions: true,
  tasks: [{ id, title: 'Zero debt in top-10 PULSE files', promptFile }],
};

writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify(manifest, null, 2));
process.stderr.write(
  `\nbuilt 1-task manifest with 10 targets, runId=${runId}, dir=${runDir}, prompt=${(prompt.length / 1024).toFixed(1)}KB\n`,
);

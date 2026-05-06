#!/usr/bin/env node
/**
 * Build a 25-task fleet manifest for PULSE no-hardcoded-reality debt reduction.
 *
 * Each task:
 *   - Targets ONE file from the auditor's top-N list (read from baseline JSON).
 *   - Embeds the full PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md verbatim.
 *   - Runs in EDIT-ONLY mode (no commits) against the onda0 worktree.
 *   - Writes a per-task report to /tmp/fleet-task-<id>-report.md.
 *
 * Output: writes manifest JSON to stdout (pipe to opencode-fleet.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = '/Users/danielpenin/whatsapp_saas';
const WORKTREE = '/Users/danielpenin/whatsapp_saas-onda0';
const GUIDE_PATH = join(WORKTREE, 'docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md');
const BASELINE = join(REPO, 'artifacts/baseline-debt-2026-05-04T2358.json');

const guide = readFileSync(GUIDE_PATH, 'utf8');
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const top = baseline.top30.slice(0, 25);

const runId = `pulse-debt-25-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const runDir = join(REPO, 'artifacts/opencode-fleet', runId);
const promptsDir = join(runDir, 'prompts');
mkdirSync(promptsDir, { recursive: true });

const tasks = top.map((entry, i) => {
  const filePath = entry.filePath;
  const baselineFindings = entry.findings;
  const id = `t${String(i + 1).padStart(2, '0')}-${filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-40)}`;
  const title = `Reduce debt in ${filePath} (baseline ${baselineFindings})`;

  const prompt = `# TASK: Reduzir divida do auditor no-hardcoded-reality em UM arquivo

## Contexto operacional
- Worktree alvo: ${WORKTREE}
- Branch: chore/ai-constitution-obsidian-graph-lock
- Baseline GLOBAL: ${baseline.totalDebt} findings em ${baseline.scannedFiles} arquivos (medido 2026-05-04 23:58 BRT)
- Voce e UM de 25 subagents paralelos. Cada um trabalha num arquivo diferente — NAO edite outro arquivo alem do seu alvo.

## Seu alvo unico
- Arquivo: \`${filePath}\`
- Findings na baseline: ${baselineFindings}
- Sua meta: reduzir esse numero, nunca subi-lo. Se nao for possivel reduzir sem quebrar comportamento, reporte STUCK com motivo objetivo.

## Restricoes NAO-NEGOCIAVEIS
1. EDIT-ONLY: nao rode \`git commit\`, \`git push\`, \`git checkout\`, \`git restore\`, nem crie branches. O CEO commita.
2. NAO toque \`scripts/pulse/no-hardcoded-reality-audit.ts\`. E governanca trancada.
3. NAO gere arquivos \`*.split.ts\` em hipotese alguma.
4. NAO delete arquivos \`*.companion.ts\` nem qualquer arquivo em \`scripts/pulse/__companions__/\`. O auditor preserva debt para delecao-sem-substituicao.
5. NAO toque arquivos fora de \`scripts/pulse/**\` (excluindo o auditor).
6. ANTES de qualquer edicao, rode \`ps aux | grep scripts/pulse/index.ts | grep -v grep\` — se ha processo ativo escrevendo PULSE, ABORTE com STUCK porque ele vai sobrescrever seu trabalho.
7. Substitua hardcode por contratos derivados de AST/predicates/observed-evidence — NAO substitua um literal por um nome de variavel que ainda contem o literal.
8. Se a substituicao quebrar o spec do arquivo, reverta a substituicao e busque outra fatia.

## Procedimento obrigatorio
1. \`cd ${WORKTREE}\`
2. Rode auditor para o seu arquivo isolado:
   \`\`\`sh
   backend/node_modules/.bin/ts-node --project scripts/pulse/tsconfig.json -e "import { auditPulseNoHardcodedReality } from './scripts/pulse/no-hardcoded-reality-audit'; const r=auditPulseNoHardcodedReality(process.cwd()); const f=r.summary.topFiles.find(x=>x.filePath==='${filePath}')||{filePath:'${filePath}',findings:0}; console.log(JSON.stringify(f,null,2));"
   \`\`\`
   Anote como \`baselineFindings\`.
3. Leia o GUIA INTEIRO abaixo (apos o separador \`==========\`). Ele contem o playbook validado por experiencia previa: ordem de restauracao, padroes AST, o que funcionou e o que nao funcionou.
4. Aplique fatias atomicas. Apos cada fatia:
   - rode o auditor novamente para o seu arquivo,
   - rode o spec focado se houver (\`scripts/pulse/__tests__/<basename>.spec.ts\` via \`npx vitest run\`),
   - se findings caiu E spec passou, mantenha; se subiu OU spec quebrou, REVERTA a fatia (\`git diff\` + edicoes manuais; nao use \`git restore\`).
5. Ao terminar (ou ao decidir parar):
   - Rode auditor uma vez mais para o arquivo, anote \`finalFindings\`.
   - Escreva relatorio em \`/tmp/fleet-task-${id}-report.md\` no formato exato abaixo.

## Formato do relatorio (\`/tmp/fleet-task-${id}-report.md\`)
\`\`\`
# Task ${id}
- file: ${filePath}
- baselineFindings: <numero>
- finalFindings: <numero>
- delta: <numero negativo = reducao>
- specsRun: <lista de specs executadas com resultado>
- stuck: <true|false>
- stuckReason: <se stuck=true, motivo objetivo>
- patches: <lista curta de fatias aplicadas>
- evidence:
  - <comandos com saida abreviada que comprovam o delta>
\`\`\`

## DICAS DE PADROES (do guia + experiencia previa)
- Se o arquivo e principal e tem companion em \`__companions__/\`, primeiro restaure o contrato publico do main module a partir do companion (sem deletar o companion), valide via \`ts-node -e "import './scripts/pulse/<basename>'"\` e spec, SO DEPOIS aplique reducoes AST.
- Se o arquivo NAO depende de companion, ataque diretamente as superficies: \`hardcoded_literal_surface_risk\`, \`hardcoded_const_declaration_risk\`, \`hardcoded_numeric_surface_risk\`, \`hardcoded_boolean_surface_risk\`. Use o catalogo TypeScript AST (\`import * as ts from 'typescript'\`) para derivar o valor a partir do contrato tipado, em vez de duplicar o literal.
- Para regex: substitua por \`ts.SyntaxKind\` checks ou \`tsCallExpressionMatches(predicateName)\` quando possivel.

## GUIA COMPLETO (LEIA INTEIRO ANTES DE EDITAR)

==========================================================================

${guide}

==========================================================================

INICIO. Reporte ao final no caminho especificado.
`;

  const promptFile = join(promptsDir, `${id}.md`);
  writeFileSync(promptFile, prompt);

  return { id, title, promptFile };
});

const manifest = {
  runId,
  dir: WORKTREE,
  concurrency: 25,
  staggerMs: 8000,
  timeoutSec: 0,
  skipPermissions: true,
  tasks,
};

writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify(manifest, null, 2));
process.stderr.write(`\nbuilt manifest: ${tasks.length} tasks, runId=${runId}, dir=${runDir}\n`);

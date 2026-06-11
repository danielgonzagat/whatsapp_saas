#!/usr/bin/env node
/**
 * iiif-driver.mjs — driver determinístico do III.f REAL v1
 * (pré-registro: docs/evidence/darwin-godel-iiif-real-v1.md, commit-carimbo).
 *
 * O driver NÃO chama LLM nenhum. Ele faz todo o resto, determinístico dado o
 * estado em disco: constrói os prompts congelados (C1 via experiment-harness),
 * julga propostas (task-suite-harness), converte rejeições em witnesses no
 * corpus da linhagem (kernel disproof-corpus), gera o briefing da próxima
 * geração (GRADIENTE), encadeia o run-ledger (C1-C5 fail-closed) e agrega
 * curvas (C5 média±desvio). Estado isolado em .atomic/evolution/iiif-real-v1/.
 *
 * Regras fixas do desenho (pré-registradas):
 * - seed = corrida independente; ledger SEPARADO por modelo (haiku/opus) para
 *   manter a monotonicidade de geração por arm::seed do verificador;
 * - corpus apenas nas linhagens GRADIENTE (ESCALAR nunca vê a parede; o
 *   wallKey do reject vai ao ledger nos DOIS braços — insumo do M2);
 * - âncora de linhagem = sha256("iiif-real-v1|<modelo>|<braço>|<seed>");
 * - ESCALAR ger.1: lastDecision='promote', lastScore=baseline (estado atual
 *   admitido), idêntico em todas as linhagens;
 * - unjudged:false sempre (texto degenerado é julgado e rejeitado pelos gates).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluateProposal, baselineScore, TASKS } from './task-suite-harness.mjs';
import {
  buildFrozenPrompt,
  appendProposalJsonl,
  verifyRunLedgerJsonl,
  aggregateArm,
} from './experiment-harness.mjs';
import {
  appendWitnessJsonl,
  verifyCorpusJsonl,
  selectDisproofs,
  buildBriefing,
  wallKey,
} from './disproof-corpus-harness.mjs';

const TASK_ID = 'task1-dedup-under-byte-cap';
const MODELS = Object.freeze(['haiku', 'opus']);
const V1_ARMS = Object.freeze(['ESCALAR', 'GRADIENTE']);
const SEEDS = Object.freeze(['s1', 's2', 's3']);
const MAX_GENERATIONS = 5;
const REGION = 'sandbox/task1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// v1.1: reinício limpo pós-contaminação g4 da v1 (ver iiif-real-v1/CONTAMINATION-NOTICE.md);
// a v1 fica preservada byte-intacta como arquivo-morto. Despachante único: lock iiif-real-v1.1-dispatcher.
const REAL_STATE_DIR = path.join(ROOT, '.atomic/evolution/iiif-real-v1.1');
// STATE_DIR é mutável APENAS para o self-test, que opera num diretório irmão
// isolado (-selftest) — rodar --self-test jamais toca os ledgers/estado reais.
let STATE_DIR = REAL_STATE_DIR;
let STATE_FILE = path.join(STATE_DIR, 'state.json');

function setStateDir(dir) {
  STATE_DIR = dir;
  STATE_FILE = path.join(dir, 'state.json');
}

const sha256Text = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

function lineageId(model, arm, seed) {
  return `${model}|${arm}|${seed}`;
}

function lineageAnchor(model, arm, seed) {
  return sha256Text(`iiif-real-v1|${model}|${arm}|${seed}`);
}

function ledgerFile(model) {
  return path.join(STATE_DIR, `run-ledger-${model}.jsonl`);
}

function corpusFile(model, arm, seed) {
  return path.join(STATE_DIR, `corpus-${model}-${arm}-${seed}.jsonl`);
}

function readOrEmpty(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function loadState() {
  const raw = fs.readFileSync(STATE_FILE, 'utf8');
  return JSON.parse(raw);
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/** Pseudo-diff determinístico (insumo do M5): linhas removidas/adicionadas. */
function pseudoDiff(before, after) {
  const beforeLines = String(before).split('\n');
  const afterLines = String(after).split('\n');
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  const removed = beforeLines.filter((line) => !afterSet.has(line)).map((line) => `- ${line}`);
  const added = afterLines.filter((line) => !beforeSet.has(line)).map((line) => `+ ${line}`);
  return [...removed, ...added].join('\n');
}

function gradienteBriefing(model, arm, seed) {
  const corpusText = readOrEmpty(corpusFile(model, arm, seed));
  if (corpusText.trim().length === 0) {
    const empty = buildBriefing({ selected: [], lessons: [] });
    return { briefingText: empty.text, briefingDigest: empty.briefingDigest, selectedCount: 0 };
  }
  const verified = verifyCorpusJsonl(corpusText);
  if (verified.ok !== true) throw new Error(`corpus da linhagem ${lineageId(model, arm, seed)} REPROVOU: ${verified.error}`);
  const selection = selectDisproofs({ corpusText, region: REGION, k: 8 });
  if (selection.ok !== true) throw new Error(`selectDisproofs falhou: ${selection.error}`);
  const briefing = buildBriefing({ selected: selection.selected, lessons: [] });
  return { briefingText: briefing.text, briefingDigest: briefing.briefingDigest, selectedCount: selection.selected.length };
}

function buildFeedback(state, model, arm, seed) {
  const lineage = state.lineages[lineageId(model, arm, seed)];
  if (arm === 'ESCALAR') {
    return { feedback: { lastDecision: lineage.lastDecision, lastScore: lineage.lastScore }, briefingDigest: null };
  }
  const briefing = gradienteBriefing(model, arm, seed);
  return { feedback: { briefingText: briefing.briefingText }, briefingDigest: briefing.briefingDigest, selectedCount: briefing.selectedCount };
}

function cmdInit({ force = false } = {}) {
  if (fs.existsSync(STATE_FILE) && force !== true) {
    return { ok: false, error: 'estado já existe; use {"force":true} para reinicializar (apaga ledgers/corpora da v1)' };
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  for (const entry of fs.readdirSync(STATE_DIR)) fs.rmSync(path.join(STATE_DIR, entry), { force: true });
  const task = TASKS[TASK_ID];
  const base = baselineScore(TASK_ID);
  const lineages = {};
  for (const model of MODELS) {
    for (const arm of V1_ARMS) {
      for (const seed of SEEDS) {
        lineages[lineageId(model, arm, seed)] = {
          model,
          arm,
          seed,
          generation: 1,
          currentText: task.baselineText,
          lastDecision: 'promote',
          lastScore: base,
          anchor: lineageAnchor(model, arm, seed),
          promotes: 0,
          rejects: 0,
          bestScore: base,
        };
      }
    }
  }
  const state = {
    kind: 'iiif-real-v1-state',
    taskId: TASK_ID,
    baselineScore: base,
    maxGenerations: MAX_GENERATIONS,
    models: [...MODELS],
    arms: [...V1_ARMS],
    seeds: [...SEEDS],
    lineages,
  };
  saveState(state);
  return { ok: true, baselineScore: base, lineageCount: Object.keys(lineages).length, stateFile: path.relative(ROOT, STATE_FILE) };
}

/**
 * Reconstrói o prompt congelado esperado para a geração CORRENTE da linhagem.
 * Fonte única de verdade do promptSha256 — usada por cmdPrompts (emissão) e por
 * judgeOne (recusa-estaleira): um dispatch construído contra outra geração tem
 * sha divergente e é recusado sem julgamento (ver CONTAMINATION-NOTICE.md).
 */
function expectedPromptFor(state, model, arm, seed) {
  const task = TASKS[state.taskId];
  const lineage = state.lineages[lineageId(model, arm, seed)];
  const { feedback, briefingDigest, selectedCount } = buildFeedback(state, model, arm, seed);
  const taskText = `${task.description}\n--- ESTADO ATUAL DO ALVO (sandbox/${state.taskId}.txt) ---\n${lineage.currentText}\n--- FIM DO ESTADO ---`;
  const prompt = buildFrozenPrompt({ arm, taskText, feedback });
  return { prompt, briefingDigest: briefingDigest ?? null, selectedCount: selectedCount ?? 0 };
}

function cmdPrompts({ model }) {
  if (!MODELS.includes(model)) return { ok: false, error: `modelo desconhecido: ${String(model)}` };
  const state = loadState();
  const out = [];
  for (const arm of state.arms) {
    for (const seed of state.seeds) {
      const id = lineageId(model, arm, seed);
      const lineage = state.lineages[id];
      if (lineage.generation > state.maxGenerations) continue;
      const { prompt, briefingDigest, selectedCount } = expectedPromptFor(state, model, arm, seed);
      out.push({
        lineageId: id,
        arm,
        seed,
        generation: lineage.generation,
        promptText: prompt.text,
        promptSha256: prompt.promptSha256,
        skeletonSha256: prompt.skeletonSha256,
        briefingDigest: briefingDigest ?? null,
        briefingWallCount: selectedCount ?? 0,
      });
    }
  }
  return { ok: true, model, prompts: out };
}

function judgeOne(state, model, proposal) {
  const lineage = state.lineages[proposal.lineageId];
  if (!lineage) throw new Error(`linhagem desconhecida: ${proposal.lineageId}`);
  if (lineage.generation > state.maxGenerations) throw new Error(`linhagem ${proposal.lineageId} já completou G=${state.maxGenerations}`);
  // RECUSA-ESTALEIRA (classe stale-world-hash): um dispatch cujo promptSha256
  // não bate com o prompt da geração corrente foi construído contra outro
  // estado — recusado por construção, sem julgamento, sem ledger, sem avanço.
  const expected = expectedPromptFor(state, model, lineage.arm, lineage.seed);
  if (String(proposal.promptSha256 ?? '') !== expected.prompt.promptSha256) {
    return {
      lineageId: proposal.lineageId,
      generation: lineage.generation,
      decision: 'refused-stale-dispatch',
      expectedPromptSha256: expected.prompt.promptSha256,
      receivedPromptSha256: proposal.promptSha256 ?? null,
    };
  }
  const proposedText = String(proposal.textoCompletoApos ?? '');
  const verdict = evaluateProposal({ taskId: state.taskId, previousText: lineage.currentText, proposedText });
  if (verdict.ok !== true) throw new Error(`evaluateProposal falhou: ${verdict.error}`);
  let recordWallKey = null;
  if (verdict.decision === 'reject') {
    recordWallKey = wallKey(verdict.witnesses[0].invariantId, verdict.witnesses[0].locus);
    if (lineage.arm === 'GRADIENTE') {
      const file = corpusFile(model, lineage.arm, lineage.seed);
      let corpusText = readOrEmpty(file);
      for (const witness of verdict.witnesses) {
        const appended = appendWitnessJsonl({
          corpusText,
          witnessArgs: {
            invariantId: witness.invariantId,
            locus: witness.locus,
            counterexample: witness.counterexample,
            proposalDigest: verdict.proposalDigest,
            verdictCodes: witness.verdictCodes,
            generation: lineage.generation,
            archiveEntrySha256: lineage.anchor,
          },
        });
        if (appended.ok !== true) throw new Error(`append de witness falhou (${proposal.lineageId}): ${appended.error}`);
        corpusText = appended.corpusText;
      }
      fs.writeFileSync(file, corpusText, 'utf8');
    }
  }
  const file = ledgerFile(model);
  const ledgerText = readOrEmpty(file);
  const appended = appendProposalJsonl({
    ledgerText,
    proposalArgs: {
      arm: lineage.arm,
      seed: lineage.seed,
      generation: lineage.generation,
      taskId: state.taskId,
      basePromptVersion: 'frozen-proposer-v1',
      promptSha256: proposal.promptSha256,
      briefingDigest: lineage.arm === 'GRADIENTE' ? proposal.briefingDigest : null,
      shadowCount: 0,
      proposalDigest: verdict.proposalDigest,
      diffText: pseudoDiff(lineage.currentText, proposedText),
      verdict: { decision: verdict.decision, rejections: verdict.rejections, wallKey: recordWallKey },
      publicScore: verdict.publicScore,
      unjudged: false,
    },
  });
  if (appended.ok !== true) throw new Error(`run-ledger recusou o registro (${proposal.lineageId}): ${appended.error}`);
  fs.writeFileSync(file, appended.ledgerText, 'utf8');
  if (verdict.decision === 'promote') {
    lineage.currentText = proposedText;
    lineage.lastDecision = 'promote';
    lineage.lastScore = verdict.publicScore;
    lineage.promotes += 1;
    lineage.bestScore = Math.max(lineage.bestScore, verdict.publicScore);
  } else {
    lineage.lastDecision = 'reject';
    lineage.rejects += 1;
  }
  lineage.generation += 1;
  return {
    lineageId: proposal.lineageId,
    generation: lineage.generation - 1,
    decision: verdict.decision,
    rejections: verdict.rejections,
    wallKey: recordWallKey,
    publicScore: verdict.publicScore,
    bestScore: lineage.bestScore,
  };
}

function cmdJudge({ model, proposals }) {
  if (!MODELS.includes(model)) return { ok: false, error: `modelo desconhecido: ${String(model)}` };
  if (!Array.isArray(proposals) || proposals.length === 0) return { ok: false, error: 'proposals deve ser um array não-vazio' };
  const state = loadState();
  const results = [];
  for (const proposal of proposals) results.push(judgeOne(state, model, proposal));
  saveState(state);
  const chain = verifyRunLedgerJsonl(readOrEmpty(ledgerFile(model)));
  if (chain.ok !== true) return { ok: false, error: `cadeia do run-ledger REPROVOU pós-judge: ${chain.error}` };
  return { ok: true, model, judged: results, ledger: chain };
}

function cmdAggregate({ model }) {
  if (!MODELS.includes(model)) return { ok: false, error: `modelo desconhecido: ${String(model)}` };
  const ledgerText = readOrEmpty(ledgerFile(model));
  const chain = verifyRunLedgerJsonl(ledgerText);
  if (chain.ok !== true) return { ok: false, error: chain.error };
  const arms = {};
  const csvRows = ['model,arm,generation,m1_mean,m1_std,m2_mean,m2_std,m3_mean,m3_std,m5_mean,m5_std,n'];
  for (const arm of V1_ARMS) {
    const agg = aggregateArm({ ledgerText, arm });
    if (agg.ok !== true) return { ok: false, error: `aggregate ${arm}: ${agg.error}` };
    arms[arm] = agg;
    for (const row of agg.perGeneration) {
      csvRows.push([
        model, arm, row.generation,
        row.m1.mean ?? '', row.m1.std ?? '',
        row.m2.mean ?? '', row.m2.std ?? '',
        row.m3.mean ?? '', row.m3.std ?? '',
        row.m5.mean ?? '', row.m5.std ?? '',
        row.m1.n,
      ].join(','));
    }
  }
  const csvPath = path.join(STATE_DIR, `curves-${model}.csv`);
  fs.writeFileSync(csvPath, csvRows.join('\n') + '\n', 'utf8');
  const state = loadState();
  const lineages = Object.values(state.lineages)
    .filter((lineage) => lineage.model === model)
    .map(({ model: m, arm, seed, promotes, rejects, bestScore, lastScore }) => ({ model: m, arm, seed, promotes, rejects, bestScore, lastScore }));
  return { ok: true, model, baselineScore: state.baselineScore, chain, arms, lineages, csv: path.relative(ROOT, csvPath) };
}

/** Self-test ISOLADO: opera em <REAL_STATE_DIR>-selftest (init→prompts→judge→limpa); nunca toca o estado/ledgers reais do experimento. */
function cmdSelfTest() {
  // subdiretório oculto DENTRO do state-dir real: gravável sob o sandbox do
  // atomic_exec (writeRoot = state-dir) e removido por inteiro no finally.
  setStateDir(path.join(REAL_STATE_DIR, '.selftest-scratch'));
  try {
    return cmdSelfTestBody();
  } finally {
    fs.rmSync(STATE_DIR, { recursive: true, force: true });
    setStateDir(REAL_STATE_DIR);
  }
}

function cmdSelfTestBody() {
  const tmpInit = cmdInit({ force: true });
  if (tmpInit.ok !== true) return { ok: false, error: `init falhou: ${tmpInit.error}` };
  const prompts = cmdPrompts({ model: 'haiku' });
  if (prompts.ok !== true || prompts.prompts.length !== 6) return { ok: false, error: 'prompts: esperava 6 linhagens haiku' };
  const sk = new Set(prompts.prompts.map((p) => p.skeletonSha256));
  if (sk.size !== 1) return { ok: false, error: `C1 quebrado no self-test: ${sk.size} skeletons distintos` };
  const esc = prompts.prompts.find((p) => p.arm === 'ESCALAR');
  const grad = prompts.prompts.find((p) => p.arm === 'GRADIENTE');
  if (!esc || !grad || esc.briefingDigest !== null || typeof grad.briefingDigest !== 'string') {
    return { ok: false, error: 'slots de braço errados no self-test' };
  }
  // proposta degenerada (vazia) → reject por public-contract; proposta idêntica → promote (score = baseline)
  const esc2 = prompts.prompts.find((p) => p.arm === 'ESCALAR' && p.seed === 's2');
  const judged = cmdJudge({
    model: 'haiku',
    proposals: [
      { lineageId: esc.lineageId, textoCompletoApos: '', promptSha256: esc.promptSha256, briefingDigest: null },
      { lineageId: grad.lineageId, textoCompletoApos: TASKS[TASK_ID].baselineText, promptSha256: grad.promptSha256, briefingDigest: grad.briefingDigest },
      // dispatch estaleiro: promptSha256 de outra geração/estado → recusado sem ledger e sem avanço
      { lineageId: esc2.lineageId, textoCompletoApos: TASKS[TASK_ID].baselineText, promptSha256: 'stale-dispatch-sha', briefingDigest: null },
    ],
  });
  if (judged.ok !== true) return { ok: false, error: `judge falhou: ${judged.error}` };
  const [r1, r2, r3] = judged.judged;
  const checks = [
    r1.decision === 'reject' && r1.rejections.includes('gate.sandbox.public-contract'),
    typeof r1.wallKey === 'string' && r1.wallKey.includes('sandbox.public-contract'),
    r2.decision === 'promote' && r2.publicScore === loadState().baselineScore,
    r3.decision === 'refused-stale-dispatch' && r3.expectedPromptSha256 === esc2.promptSha256,
    judged.ledger.recordCount === 2,
    loadState().lineages[esc2.lineageId].generation === 1,
  ];
  // briefing da próxima geração do GRADIENTE rejeitado? (o reject foi do ESCALAR; o corpus do GRADIENTE segue vazio)
  const after = cmdPrompts({ model: 'haiku' });
  const grad2 = after.prompts.find((p) => p.lineageId === grad.lineageId);
  checks.push(grad2.generation === 2 && grad2.briefingWallCount === 0);
  const okAll = checks.every(Boolean);
  // limpa o estado do self-test para não contaminar a rodada real
  for (const entry of fs.readdirSync(STATE_DIR)) fs.rmSync(path.join(STATE_DIR, entry), { force: true });
  return okAll ? { ok: true, checks: checks.length, cleaned: true } : { ok: false, error: `checks falharam: ${JSON.stringify(checks)}` };
}

function parseJsonInput(stdinText) {
  const trimmed = String(stdinText ?? '').trim();
  if (trimmed.length === 0) return {};
  return JSON.parse(trimmed);
}

export function runCli(argv, stdinText) {
  const mode = argv[0] ?? '--help';
  try {
    if (mode === '--help') {
      return { ok: true, modes: ['--help', '--self-test', '--init', '--prompts', '--judge', '--aggregate'], stateDir: path.relative(ROOT, STATE_DIR), arms: V1_ARMS, models: MODELS, maxGenerations: MAX_GENERATIONS };
    }
    if (mode === '--self-test') return cmdSelfTest();
    const input = parseJsonInput(stdinText);
    if (mode === '--init') return cmdInit(input);
    if (mode === '--prompts') return cmdPrompts(input);
    if (mode === '--judge') return cmdJudge(input);
    if (mode === '--aggregate') return cmdAggregate(input);
    return { ok: false, error: `modo desconhecido do driver: ${mode}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isCliMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isCliMain()) {
  const mode = process.argv[2] ?? '--help';
  const needsInput = !['--help', '--self-test'].includes(mode);
  const stdinText = needsInput ? fs.readFileSync(0, 'utf8') : '';
  const result = runCli([mode], stdinText);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok === false ? 1 : 0; // exit() truncava stdout >64KiB em pipe (ver disproof-corpus-harness)
}

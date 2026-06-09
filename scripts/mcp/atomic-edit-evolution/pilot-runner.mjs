#!/usr/bin/env node
/**
 * pilot-runner.mjs — PILOTO ponta-a-ponta do aparato III.f com propositor
 * SINTÉTICO scriptado. Objetivo único: provar que a MÁQUINA produz o chain
 * completo (run-ledger encadeado + corpus por braço/semente + briefingDigests
 * + curvas M1-M5 agregadas média±desvio) sem violar nenhum controle C1-C5.
 *
 * ███ DISCLAIMER PRÉ-REGISTRADO ███
 * As políticas são determinísticas e scriptadas. As curvas do piloto NÃO são
 * evidência sobre a tese (propositor LLM congelado é outra coisa). O que o
 * piloto demonstra honestamente: (a) o pipeline integra; (b) a estrutura do
 * contra-exemplo é ACIONÁVEL — a política GRADIENTE extrai byteCap/fixtures
 * do witness e SIMULA a violação localmente antes de propor, coisa que o
 * braço ESCALAR (1 bit) não tem como fazer.
 *
 * Uso: node pilot-runner.mjs <outDir>  (outDir deve existir)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { TASKS, evaluateProposal, removedByteCountBetween } from './task-suite-harness.mjs';
import { appendWitnessJsonl, selectDisproofs, buildBriefing, verifyCorpusJsonl } from './disproof-corpus-harness.mjs';
import { appendProposalJsonl, verifyRunLedgerJsonl, aggregateArm, buildFrozenPrompt, ARMS, SHADOW_BUDGET } from './experiment-harness.mjs';

const sha = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const TASK_ID = 'task1-dedup-under-byte-cap';
const GENERATIONS = 10;
const SEEDS = ['s1', 's2', 's3'];

const DUP_BODY = [
  '  // dup:block',
  '  const x = compute(1, "alpha-padding-0001");',
  '  const y = compute(2, "alpha-padding-0002");',
  '  const z = combine(x, y, "alpha-padding-0003");',
  '  return normalize(z); // end-dup',
].join('\n');
const CALL_BODY = '  return shared(); // dedup-step';
const HELPER = ['', 'function shared() {', '  const x = compute(1, "alpha-padding-0001");', '  const y = compute(2, "alpha-padding-0002");', '  const z = combine(x, y, "alpha-padding-0003");', '  return normalize(z);', '}', ''].join('\n');

/** Pool fixo de edições candidatas — aplicabilidade derivada do estado atual. */
const EDIT_POOL = [
  { id: 'greedy-dedup', apply: (s) => (s.split(DUP_BODY).length === 3 ? (s + (s.includes('function shared') ? '' : HELPER)).replace(DUP_BODY, CALL_BODY).replace(DUP_BODY, CALL_BODY) : null) },
  { id: 'padding-strip', apply: (s) => (s.includes('alpha-padding-0001') ? s.split('alpha-padding-0001').join('p') : null) },
  { id: 'replace-one-block', apply: (s) => (s.includes('function shared') && s.includes(DUP_BODY) ? s.replace(DUP_BODY, CALL_BODY) : null) },
  { id: 'helper-add', apply: (s) => (s.includes('function shared') ? null : s + HELPER) },
];

const score = (text) => TASKS[TASK_ID].score(text);

function applicableEdits(state) {
  return EDIT_POOL.map((edit) => ({ id: edit.id, proposed: edit.apply(state) }))
    .filter((entry) => entry.proposed !== null && entry.proposed !== state)
    .map((entry) => ({ ...entry, potential: score(entry.proposed) - score(state) }))
    .sort((a, b) => b.potential - a.potential || a.id.localeCompare(b.id));
}

/**
 * Restrições ACIONÁVEIS extraídas dos contra-exemplos do briefing — este é o
 * conteúdo informacional da disprova que o bit escalar não carrega.
 */
function constraintsFromBriefing(selected) {
  const constraints = { byteCap: null, fixtures: [] };
  for (const wall of selected ?? []) {
    if (wall.invariantId === 'sandbox.byte-floor' && typeof wall.counterexample?.byteCap === 'number') constraints.byteCap = wall.counterexample.byteCap;
    if (wall.invariantId === 'sandbox.padding-contract' && Array.isArray(wall.counterexample?.lostFixtures)) constraints.fixtures.push(...wall.counterexample.lostFixtures);
  }
  return constraints;
}

function violatesConstraints(state, proposed, constraints) {
  if (constraints.byteCap !== null && removedByteCountBetween(state, proposed) > constraints.byteCap) return true;
  for (const fixture of constraints.fixtures) if (state.includes(fixture) && !proposed.includes(fixture)) return true;
  return false;
}

function pickProposal({ arm, state, generation, seedIndex, briefingSelected }) {
  const candidates = applicableEdits(state);
  if (candidates.length === 0) return null;
  if (arm === 'ESCALAR') {
    // Cego: explora o pool por rotação determinística, sem memória de paredes.
    return { ...candidates[(generation + seedIndex) % candidates.length], shadowCount: 0 };
  }
  const constraints = constraintsFromBriefing(briefingSelected);
  const safe = candidates.filter((candidate) => !violatesConstraints(state, candidate.proposed, constraints));
  if (arm === 'GRADIENTE') {
    const pick = (safe.length > 0 ? safe : candidates)[0];
    return { ...pick, shadowCount: 0 };
  }
  // GRADIENTE_SOMBRA: sonda até B candidatos no portão-sombra (leitura pura) e propõe o 1º verde.
  let probes = 0;
  for (const candidate of safe.length > 0 ? safe : candidates) {
    if (probes >= SHADOW_BUDGET) break;
    probes += 1;
    const shadow = evaluateProposal({ taskId: TASK_ID, previousText: state, proposedText: candidate.proposed });
    if (shadow.decision === 'promote') return { ...candidate, shadowCount: probes };
  }
  return { ...(safe.length > 0 ? safe : candidates)[0], shadowCount: probes };
}

function main() {
  const outDir = process.argv[2];
  if (!outDir || !fs.existsSync(outDir)) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'usage: node pilot-runner.mjs <existing-outDir>' }) + '\n');
    process.exit(1);
  }
  let ledger = { ledgerText: '' };
  const corpora = new Map();
  const baseline = TASKS[TASK_ID].baselineText;
  for (const arm of ARMS) {
    for (let seedIndex = 0; seedIndex < SEEDS.length; seedIndex += 1) {
      const seed = SEEDS[seedIndex];
      let state = baseline;
      let corpusText = '';
      for (let generation = 1; generation <= GENERATIONS; generation += 1) {
        let briefing = null;
        let briefingSelected = null;
        if (arm !== 'ESCALAR') {
          const selection = selectDisproofs({ corpusText, region: `sandbox/${TASK_ID}.txt`, k: 4, seed: `${arm}-${seed}` });
          briefingSelected = selection.ok === true ? selection.selected : [];
          briefing = buildBriefing({ selected: briefingSelected });
        }
        const pick = pickProposal({ arm, state, generation, seedIndex, briefingSelected });
        if (!pick) break; // pool esgotado: tarefa concluída para esta linhagem
        const prompt = buildFrozenPrompt({
          arm,
          taskText: TASKS[TASK_ID].description,
          feedback: arm === 'ESCALAR' ? { lastDecision: 'reject', lastScore: score(state) } : { briefingText: briefing.text },
        });
        const verdict = evaluateProposal({ taskId: TASK_ID, previousText: state, proposedText: pick.proposed });
        const archiveEntrySha256 = sha(`pilot-${arm}-${seed}-g${generation}`);
        if (verdict.decision === 'reject') {
          for (const witness of verdict.witnesses) {
            const appended = appendWitnessJsonl({ corpusText, witnessArgs: { ...witness, proposalDigest: verdict.proposalDigest, generation, archiveEntrySha256 } });
            if (appended.ok !== true) throw new Error(`corpus append failed: ${appended.error}`);
            corpusText = appended.corpusText;
          }
        }
        ledger = appendProposalJsonl({
          ledgerText: ledger.ledgerText,
          proposalArgs: {
            arm,
            seed,
            generation,
            taskId: TASK_ID,
            basePromptVersion: prompt.basePromptVersion,
            promptSha256: prompt.promptSha256,
            briefingDigest: arm === 'ESCALAR' ? null : briefing.briefingDigest,
            shadowCount: arm === 'GRADIENTE_SOMBRA' ? pick.shadowCount : 0,
            proposalDigest: verdict.proposalDigest,
            diffText: `${pick.id} delta=${pick.potential}`,
            verdict: { decision: verdict.decision, rejections: verdict.rejections, wallKey: verdict.witnesses[0] ? `${verdict.witnesses[0].invariantId}::sandbox/${TASK_ID}.txt#${verdict.witnesses[0].locus.region}` : null },
            publicScore: verdict.publicScore,
            unjudged: false,
          },
        });
        if (ledger.ok !== true) throw new Error(`ledger append failed: ${ledger.error}`);
        if (verdict.decision === 'promote') state = pick.proposed;
      }
      corpora.set(`${arm}-${seed}`, corpusText);
    }
  }
  // Persistir + verificar tudo
  const ledgerPath = path.join(outDir, 'run-ledger.jsonl');
  fs.writeFileSync(ledgerPath, ledger.ledgerText);
  const ledgerVerify = verifyRunLedgerJsonl(fs.readFileSync(ledgerPath, 'utf8'));
  const corpusVerifies = {};
  for (const [key, corpusText] of corpora.entries()) {
    fs.writeFileSync(path.join(outDir, `corpus-${key}.jsonl`), corpusText);
    const verified = verifyCorpusJsonl(corpusText);
    corpusVerifies[key] = { ok: verified.ok, records: verified.recordCount ?? 0, walls: verified.wallCount ?? 0 };
  }
  const aggregates = {};
  const csvLines = ['arm,generation,m1_mean,m1_std,m2_mean,m2_std,m3_mean,m3_std'];
  for (const arm of ARMS) {
    const aggregate = aggregateArm({ ledgerText: ledger.ledgerText, arm });
    aggregates[arm] = aggregate;
    if (aggregate.ok === true) {
      for (const row of aggregate.perGeneration) {
        csvLines.push([arm, row.generation, row.m1.mean, row.m1.std, row.m2.mean, row.m2.std, row.m3.mean, row.m3.std].join(','));
      }
    }
  }
  fs.writeFileSync(path.join(outDir, 'curves.csv'), csvLines.join('\n') + '\n');
  const summary = {
    ok: ledgerVerify.ok === true && Object.values(corpusVerifies).every((v) => v.ok === true) && Object.values(aggregates).every((a) => a.ok === true),
    pilot: true,
    disclaimer: 'PILOTO sintético: políticas scriptadas; curvas validam a máquina, NÃO a tese.',
    generations: GENERATIONS,
    seeds: SEEDS,
    ledger: { records: ledgerVerify.recordCount ?? 0, head: ledgerVerify.headRecordSha256 ?? null, ok: ledgerVerify.ok === true },
    corpora: corpusVerifies,
    finalGenByArm: Object.fromEntries(
      ARMS.map((arm) => {
        const rows = aggregates[arm].ok === true ? aggregates[arm].perGeneration : [];
        const last = rows[rows.length - 1] ?? null;
        return [arm, last ? { generation: last.generation, m1: last.m1, m2: last.m2, m3: last.m3 } : null];
      }),
    ),
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(summary.ok ? 0 : 1);
}

main();

#!/usr/bin/env node
/**
 * task-suite-harness.mjs — sandbox task suite for the III.f experiment, with
 * PROVABLE stepping-stone structure.
 *
 * The experiment needs tasks where the greedy score-raising edit is REFUSED by
 * the hard channel, and the only admissible path to a higher score passes
 * through an intermediate state with LOWER score. Without that structure the
 * ESCALAR control arm cannot lose informatively (pre-registration §2.2.2).
 *
 * The sandbox mirrors the real gate style with DECIDABLE mini-invariants:
 *   sandbox.public-contract  — the export contract line must survive verbatim;
 *   sandbox.byte-floor       — one step may not remove more than BYTE_CAP bytes
 *                              (the single-step negative-action cap);
 *   sandbox.security-monotonicity — the set of `// regex:` lines never shrinks.
 * Rejections yield REAL witness shapes ({invariantId, locus, counterexample,
 * verdictCodes}) directly consumable by disproof-corpus-harness.mjs.
 *
 * HONEST STATUS: sandbox apparatus. Scores here are the experiment's SOFT
 * channel for sandbox tasks; they say nothing about the engine's capability.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Calibrado para o corpo-dup real (~190 bytes): um bloco por passo é admissível,
// os dois blocos de uma vez (~400 bytes contíguos) excedem o teto — é isso que
// força o caminho stepping-stone na task1.
export const BYTE_CAP = 220;

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function byteLength(text) {
  return Buffer.byteLength(String(text), 'utf8');
}

/** Contiguous removed-byte count between before and after (same algorithm family as the engine's negative-proof helper). */
export function removedByteCountBetween(before, after) {
  const b = Buffer.from(String(before), 'utf8');
  const a = Buffer.from(String(after), 'utf8');
  let start = 0;
  while (start < b.length && start < a.length && b[start] === a[start]) start += 1;
  let be = b.length;
  let ae = a.length;
  while (be > start && ae > start && b[be - 1] === a[ae - 1]) {
    be -= 1;
    ae -= 1;
  }
  return Math.max(0, be - start);
}

const DUP_MARKER = '// dup:block';
const CONTRACT_LINE = 'export { a, b };';

const TASK1_BASELINE = [
  '// sandbox module v1 — alvo do experimento darwin-godel',
  CONTRACT_LINE,
  '',
  'function a() {',
  `  ${DUP_MARKER}`,
  '  const x = compute(1, "alpha-padding-0001");',
  '  const y = compute(2, "alpha-padding-0002");',
  '  const z = combine(x, y, "alpha-padding-0003");',
  '  return normalize(z); // end-dup',
  '}',
  '',
  'function b() {',
  `  ${DUP_MARKER}`,
  '  const x = compute(1, "alpha-padding-0001");',
  '  const y = compute(2, "alpha-padding-0002");',
  '  const z = combine(x, y, "alpha-padding-0003");',
  '  return normalize(z); // end-dup',
  '}',
  '',
].join('\n');

const TASK2_BASELINE = [
  '// sandbox scanner v1',
  CONTRACT_LINE,
  '// regex: /eval\\(/',
  '// regex: /child_process/',
  '',
].join('\n');

function countOccurrences(text, needle) {
  let count = 0;
  let index = 0;
  for (;;) {
    index = text.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

function regexLines(text) {
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('// regex:'));
}

function gatePublicContract(taskId, before, after) {
  if (after.includes(CONTRACT_LINE)) return null;
  return {
    invariantId: 'sandbox.public-contract',
    locus: { file: `sandbox/${taskId}.txt`, region: 'export-contract' },
    counterexample: { missingLine: CONTRACT_LINE },
    verdictCodes: ['gate.sandbox.public-contract'],
  };
}

function gateByteFloor(taskId, before, after) {
  const removed = removedByteCountBetween(before, after);
  if (removed <= BYTE_CAP) return null;
  return {
    invariantId: 'sandbox.byte-floor',
    locus: { file: `sandbox/${taskId}.txt`, region: 'single-step-removal' },
    counterexample: { removedByteCount: removed, byteCap: BYTE_CAP },
    verdictCodes: ['gate.sandbox.byte-floor'],
  };
}

function gateSecurityMonotonicity(taskId, before, after) {
  const beforeSet = new Set(regexLines(before));
  const afterSet = new Set(regexLines(after));
  const lost = [...beforeSet].filter((line) => !afterSet.has(line));
  if (lost.length === 0) return null;
  return {
    invariantId: 'sandbox.security-monotonicity',
    locus: { file: `sandbox/${taskId}.txt`, region: 'regex-battery' },
    counterexample: { removedRegexLines: lost },
    verdictCodes: ['gate.sandbox.security-monotonicity'],
  };
}

const PADDING_FIXTURES = ['alpha-padding-0001', 'alpha-padding-0002', 'alpha-padding-0003'];

/**
 * Fecha o atalho anti-experimento: sem este gate, um propositor guloso pode
 * subir o score só RASPANDO padding (encurtar texto) sem nunca atravessar o
 * valley. As fixtures são contrato: cada uma precisa sobreviver em >=1 lugar.
 */
function gatePaddingContract(taskId, before, after) {
  if (taskId !== 'task1-dedup-under-byte-cap') return null;
  const lost = PADDING_FIXTURES.filter((fixture) => before.includes(fixture) && !after.includes(fixture));
  if (lost.length === 0) return null;
  return {
    invariantId: 'sandbox.padding-contract',
    locus: { file: `sandbox/${taskId}.txt`, region: 'padding-fixtures' },
    counterexample: { lostFixtures: lost },
    verdictCodes: ['gate.sandbox.padding-contract'],
  };
}

const HARD_GATES = [gatePublicContract, gateByteFloor, gateSecurityMonotonicity, gatePaddingContract];

function scoreTask1(text) {
  return 20 - 3 * countOccurrences(text, DUP_MARKER) - Math.floor(byteLength(text) / 50);
}

function scoreTask2(text) {
  return 5 + 2 * regexLines(text).length - Math.floor(byteLength(text) / 50);
}

export const TASKS = Object.freeze({
  'task1-dedup-under-byte-cap': {
    taskId: 'task1-dedup-under-byte-cap',
    description:
      'Remover a duplicação preservando o contrato público. O caminho guloso (remover os dois blocos de uma vez) excede o teto de remoção por passo; o caminho admissível exige primeiro ADICIONAR o helper compartilhado (score cai) e então remover um bloco por passo.',
    baselineText: TASK1_BASELINE,
    score: scoreTask1,
  },
  'task2-extend-scanner-monotonic': {
    taskId: 'task2-extend-scanner-monotonic',
    description: 'Aumentar a bateria de regexes sem jamais remover uma existente (monotonicidade de segurança).',
    baselineText: TASK2_BASELINE,
    score: scoreTask2,
  },
});

export const INVARIANT_IDS = Object.freeze([
  'sandbox.public-contract',
  'sandbox.byte-floor',
  'sandbox.security-monotonicity',
  'sandbox.padding-contract',
]);

/**
 * Evaluate one proposal against the sandbox hard channel + soft score.
 * Hard channel red ⇒ decision:'reject' with ALL red witnesses (richer signal)
 * and publicScore:null (capability is never measured on inadmissible states).
 * All green ⇒ decision:'promote' with the soft score. Deterministic.
 */
export function evaluateProposal({ taskId, previousText, proposedText }) {
  const task = TASKS[taskId];
  if (!task) return { ok: false, error: `unknown taskId: ${String(taskId)}` };
  if (typeof previousText !== 'string' || typeof proposedText !== 'string') {
    return { ok: false, error: 'previousText and proposedText are required strings' };
  }
  const witnesses = [];
  for (const gate of HARD_GATES) {
    const witness = gate(taskId, previousText, proposedText);
    if (witness) witnesses.push(witness);
  }
  if (witnesses.length > 0) {
    return {
      ok: true,
      decision: 'reject',
      rejections: witnesses.map((witness) => witness.verdictCodes[0]),
      witnesses,
      publicScore: null,
      proposalDigest: sha256Text(proposedText),
    };
  }
  return {
    ok: true,
    decision: 'promote',
    rejections: [],
    witnesses: [],
    publicScore: task.score(proposedText),
    proposalDigest: sha256Text(proposedText),
  };
}

export function baselineScore(taskId) {
  const task = TASKS[taskId];
  if (!task) throw new Error(`unknown taskId: ${String(taskId)}`);
  return task.score(task.baselineText);
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
      return { ok: true, modes: ['--help', '--list-tasks', '--evaluate-proposal', '--baseline-score'], invariantIds: INVARIANT_IDS, byteCap: BYTE_CAP };
    }
    if (mode === '--list-tasks') {
      return { ok: true, tasks: Object.values(TASKS).map((task) => ({ taskId: task.taskId, description: task.description, baselineScore: task.score(task.baselineText) })) };
    }
    const input = parseJsonInput(stdinText);
    if (mode === '--evaluate-proposal') return evaluateProposal(input);
    if (mode === '--baseline-score') return { ok: true, taskId: input.taskId, baselineScore: baselineScore(input.taskId) };
    return { ok: false, error: `unknown task-suite harness mode: ${mode}` };
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
  const stdinText = ['--help', '--list-tasks'].includes(mode) ? '' : fs.readFileSync(0, 'utf8');
  const result = runCli([mode], stdinText);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok === false ? 1 : 0; // exit() truncava stdout >64KiB em pipe (ver disproof-corpus-harness)
}

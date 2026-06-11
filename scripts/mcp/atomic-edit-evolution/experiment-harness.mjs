#!/usr/bin/env node
/**
 * experiment-harness.mjs — deterministic apparatus for the pre-registered
 * three-arm experiment (III.f; docs/evidence/darwin-godel-preregistration-v1.md).
 *
 * It does NOT run the proposer and does NOT run gates. It enforces, at build
 * time and at verify time, the experiment CONTROLS that decide whether the
 * curves mean anything:
 *   C1 frozen proposer: one base-prompt version, byte-identical skeleton across
 *      arms — the ONLY difference between arms is the information slot;
 *   C2 no leakage: an ESCALAR record carrying a briefingDigest is REFUSED;
 *   C3 shadow budget: probes only in GRADIENTE_SOMBRA, capped at B=3;
 *   C4 auditable lineage: hash-chained run-ledger, recomputable by third parties;
 *   C5 pre-registered reporting: mean ± std across seeds, never best-run.
 *
 * HONEST STATUS: apparatus only. No experiment has run. Synthetic data in the
 * proof exercises the PIPELINE, it is not evidence about the thesis.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeMetrics } from './disproof-corpus-harness.mjs';

const SCHEMA_VERSION = 1;
const PROPOSAL_KIND = 'atomic-experiment-proposal';
export const BASE_PROMPT_VERSION = 'frozen-proposer-v1';
export const ARMS = ['ESCALAR', 'GRADIENTE', 'GRADIENTE_SOMBRA'];
export const SHADOW_BUDGET = 3;
const SLOT_PLACEHOLDER = '<CANAL_DE_INFORMACAO>';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function asNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function recordHash(body) {
  const copy = { ...body };
  delete copy.recordSha256;
  return canonicalSha256(copy);
}

const BASE_SECTIONS = Object.freeze([
  'Você é o propositor congelado do experimento darwin-godel. Proponha exatamente UMA edição no alvo para avançar a tarefa.',
  'REGRAS FIXAS: edição mínima; saída = diff unificado + uma linha de intenção; jamais tocar em gates/validadores; nenhuma fonte externa.',
  '<TAREFA>',
  SLOT_PLACEHOLDER,
  'FIM DAS INSTRUÇÕES. Responda apenas com o diff e a intenção.',
]);

function armSlotContent(arm, feedback) {
  if (arm === 'ESCALAR') {
    const verdict = feedback?.lastDecision === 'promote' ? 'PASSOU' : 'FALHOU';
    const score = asNumber(feedback?.lastScore, 0);
    return `RESULTADO DA SUA ÚLTIMA PROPOSTA: ${verdict} (score=${score}). Nenhuma outra informação disponível.`;
  }
  if (arm === 'GRADIENTE') {
    if (!nonEmptyString(feedback?.briefingText)) throw new Error('GRADIENTE requires briefingText');
    return feedback.briefingText;
  }
  if (arm === 'GRADIENTE_SOMBRA') {
    if (!nonEmptyString(feedback?.briefingText)) throw new Error('GRADIENTE_SOMBRA requires briefingText');
    return `${feedback.briefingText}\nSONDAGEM: você pode consultar shadowGate(diff) até ${SHADOW_BUDGET} vezes antes de propor; ele retorna witnesses (a parede), nunca o diff corrigido.`;
  }
  throw new Error(`unknown arm: ${String(arm)}`);
}

/**
 * Build the frozen prompt for one proposal. The skeleton (everything except the
 * information slot) is byte-identical across arms — provable via skeletonSha256.
 */
export function buildFrozenPrompt({ arm, taskText, feedback }) {
  if (!ARMS.includes(arm)) throw new Error(`unknown arm: ${String(arm)}`);
  if (!nonEmptyString(taskText)) throw new Error('taskText is required');
  const slot = armSlotContent(arm, feedback);
  const sections = BASE_SECTIONS.map((section) => {
    if (section === '<TAREFA>') return `TAREFA: ${taskText}`;
    if (section === SLOT_PLACEHOLDER) return slot;
    return section;
  });
  const text = sections.join('\n\n');
  const skeletonSections = BASE_SECTIONS.map((section) => (section === '<TAREFA>' ? `TAREFA: ${taskText}` : section));
  return {
    text,
    promptSha256: sha256Text(text),
    skeletonSha256: sha256Text(skeletonSections.join('\n\n')),
    slotSha256: sha256Text(slot),
    basePromptVersion: BASE_PROMPT_VERSION,
  };
}

function enforceArmControls(args) {
  const { arm, briefingDigest, shadowCount } = args;
  if (!ARMS.includes(arm)) throw new Error(`unknown arm: ${String(arm)}`);
  if (arm === 'ESCALAR') {
    if (briefingDigest !== null) throw new Error('C2 LEAKAGE: ESCALAR record must carry briefingDigest=null');
    if (asNumber(shadowCount, 0) !== 0) throw new Error('C3: ESCALAR record must carry shadowCount=0');
  }
  if (arm === 'GRADIENTE') {
    if (!nonEmptyString(briefingDigest)) throw new Error('C2: GRADIENTE record requires briefingDigest');
    if (asNumber(shadowCount, 0) !== 0) throw new Error('C3: GRADIENTE record must carry shadowCount=0');
  }
  if (arm === 'GRADIENTE_SOMBRA') {
    if (!nonEmptyString(briefingDigest)) throw new Error('C2: GRADIENTE_SOMBRA record requires briefingDigest');
    const probes = asNumber(shadowCount, 0);
    if (probes < 0 || probes > SHADOW_BUDGET) throw new Error(`C3: shadowCount must be in [0, ${SHADOW_BUDGET}]`);
  }
}

/**
 * Build one hash-chained run-ledger record for a proposal outcome.
 * Fail-closed on every control; a record that violates a control is never built.
 */
export function buildProposalRecord(args) {
  if (!isRecord(args)) throw new Error('proposal args must be an object');
  const briefingDigest = args.briefingDigest ?? null;
  enforceArmControls({ arm: args.arm, briefingDigest, shadowCount: args.shadowCount ?? 0 });
  if (args.basePromptVersion !== BASE_PROMPT_VERSION) {
    throw new Error(`C1 FROZEN: basePromptVersion must be ${BASE_PROMPT_VERSION}`);
  }
  if (!nonEmptyString(args.seed)) throw new Error('seed is required');
  if (!Number.isInteger(args.generation) || args.generation < 1) throw new Error('generation must be a positive integer');
  if (!nonEmptyString(args.taskId)) throw new Error('taskId is required');
  if (!nonEmptyString(args.promptSha256)) throw new Error('promptSha256 is required (audit of what the proposer saw)');
  if (!nonEmptyString(args.proposalDigest)) throw new Error('proposalDigest is required');
  const decision = args.verdict?.decision;
  if (decision !== 'promote' && decision !== 'reject') throw new Error("verdict.decision must be 'promote' | 'reject'");
  if (decision === 'reject' && (!Array.isArray(args.verdict.rejections) || args.verdict.rejections.length === 0)) {
    throw new Error('reject verdict requires non-empty rejections');
  }
  const previous = args.previousRecord ?? null;
  if (previous !== null && !isRecord(previous)) throw new Error('previousRecord must be a record or null');
  const body = {
    kind: PROPOSAL_KIND,
    schemaVersion: SCHEMA_VERSION,
    sequence: previous ? asNumber(previous.sequence, 0) + 1 : 1,
    previousRecordSha256: previous ? recordHash(previous) : null,
    arm: args.arm,
    seed: args.seed,
    generation: args.generation,
    taskId: args.taskId,
    basePromptVersion: BASE_PROMPT_VERSION,
    promptSha256: args.promptSha256,
    briefingDigest,
    shadowCount: asNumber(args.shadowCount, 0),
    proposalDigest: args.proposalDigest,
    diffText: nonEmptyString(args.diffText) ? args.diffText : null,
    verdict: {
      decision,
      rejections: decision === 'reject' ? [...args.verdict.rejections] : [],
      wallKey: nonEmptyString(args.verdict?.wallKey) ? args.verdict.wallKey : null,
    },
    publicScore: args.publicScore === null || args.publicScore === undefined ? null : asNumber(args.publicScore, 0),
    unjudged: args.unjudged === true,
  };
  return { ...body, recordSha256: recordHash(body) };
}

export function parseLedgerJsonl(text) {
  const lines = String(text ?? '').split('\n');
  const records = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      return { ok: false, error: `ledger line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!isRecord(parsed)) return { ok: false, error: `ledger line ${index + 1} must be an object` };
    records.push(parsed);
  }
  return { ok: true, records };
}

export function verifyRunLedgerJsonl(text) {
  const parsed = parseLedgerJsonl(text);
  if (parsed.ok !== true) return parsed;
  let previous = null;
  const lastGeneration = new Map();
  for (let i = 0; i < parsed.records.length; i += 1) {
    const record = parsed.records[i];
    if (record.kind !== PROPOSAL_KIND) return { ok: false, error: `ledger record ${i + 1} has unknown kind` };
    const recomputed = recordHash(record);
    if (record.recordSha256 !== recomputed) {
      return { ok: false, error: `ledger record ${i + 1} recordSha256 mismatch (declared ${record.recordSha256}, recomputed ${recomputed})` };
    }
    const previousSha = previous ? recordHash(previous) : null;
    if ((record.previousRecordSha256 ?? null) !== previousSha) {
      return { ok: false, error: `ledger record ${i + 1} breaks the chain` };
    }
    if (record.basePromptVersion !== BASE_PROMPT_VERSION) {
      return { ok: false, error: `ledger record ${i + 1} violates C1 (frozen proposer): ${String(record.basePromptVersion)}` };
    }
    try {
      enforceArmControls({ arm: record.arm, briefingDigest: record.briefingDigest ?? null, shadowCount: record.shadowCount });
    } catch (error) {
      return { ok: false, error: `ledger record ${i + 1} violates controls: ${error instanceof Error ? error.message : String(error)}` };
    }
    const armSeedKey = `${record.arm}::${record.seed}`;
    const last = lastGeneration.get(armSeedKey) ?? 0;
    if (asNumber(record.generation, 0) < last) {
      return { ok: false, error: `ledger record ${i + 1} regresses generation for ${armSeedKey}` };
    }
    lastGeneration.set(armSeedKey, asNumber(record.generation, 0));
    previous = record;
  }
  return { ok: true, recordCount: parsed.records.length, headRecordSha256: previous ? previous.recordSha256 : null };
}

export function appendProposalJsonl({ ledgerText = '', proposalArgs }) {
  const existing = verifyRunLedgerJsonl(ledgerText);
  if (existing.ok !== true) return { ok: false, error: `existing ledger rejected: ${existing.error}` };
  const records = parseLedgerJsonl(ledgerText).records;
  const previousRecord = records.length > 0 ? records[records.length - 1] : null;
  const record = buildProposalRecord({ ...proposalArgs, previousRecord });
  const normalized = String(ledgerText ?? '').trimEnd();
  const nextLedgerText = `${normalized.length === 0 ? '' : `${normalized}\n`}${JSON.stringify(record)}\n`;
  const verified = verifyRunLedgerJsonl(nextLedgerText);
  return { ok: verified.ok === true, changed: true, record, ledgerText: nextLedgerText, chain: verified };
}

function ledgerToMetricsProposals(records) {
  return records.map((record) => ({
    generation: record.generation,
    admitted: record.verdict?.decision === 'promote',
    wallKey: record.verdict?.wallKey ?? undefined,
    diffText: record.diffText ?? undefined,
    publicScore: record.publicScore ?? undefined,
    shadowCount: record.shadowCount,
    unjudged: record.unjudged === true,
  }));
}

function meanStd(values) {
  const usable = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (usable.length === 0) return { mean: null, std: null, n: 0 };
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const variance = usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.length;
  return { mean, std: Math.sqrt(variance), n: usable.length };
}

/**
 * Pre-registered reporting (C5): per arm, per generation, mean ± std ACROSS
 * SEEDS of M1/M2/M5 (+ M3 mean), computed by running computeMetrics per
 * (arm, seed) series. Never returns a best-run.
 */
export function aggregateArm({ ledgerText, arm }) {
  const verified = verifyRunLedgerJsonl(ledgerText);
  if (verified.ok !== true) return { ok: false, error: verified.error };
  const records = parseLedgerJsonl(ledgerText).records.filter((record) => record.arm === arm);
  if (records.length === 0) return { ok: false, error: `no records for arm ${arm}` };
  const seeds = [...new Set(records.map((record) => record.seed))].sort();
  const perSeed = new Map();
  for (const seed of seeds) {
    const series = computeMetrics({ proposals: ledgerToMetricsProposals(records.filter((record) => record.seed === seed)) });
    if (series.ok !== true) return { ok: false, error: `metrics failed for seed ${seed}: ${series.error}` };
    perSeed.set(seed, series);
  }
  const generations = [...new Set(records.map((record) => record.generation))].sort((a, b) => a - b);
  const perGeneration = generations.map((generation) => {
    const rows = seeds
      .map((seed) => perSeed.get(seed).perGeneration.find((row) => row.generation === generation))
      .filter(Boolean);
    return {
      generation,
      m1: meanStd(rows.map((row) => row.m1AdmissionRate)),
      m2: meanStd(rows.map((row) => row.m2WallRepeatRate)),
      m3: meanStd(rows.map((row) => row.m3Capability)),
      m5: meanStd(rows.map((row) => row.m5NoveltyIndex)),
      unjudged: meanStd(rows.map((row) => row.unjudgedRate)),
    };
  });
  return { ok: true, arm, seeds, perGeneration };
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
      return {
        ok: true,
        modes: ['--help', '--build-frozen-prompt', '--append-proposal-jsonl', '--verify-run-ledger-jsonl', '--aggregate-arm'],
        basePromptVersion: BASE_PROMPT_VERSION,
        arms: ARMS,
        shadowBudget: SHADOW_BUDGET,
      };
    }
    const input = parseJsonInput(stdinText);
    if (mode === '--build-frozen-prompt') return { ok: true, prompt: buildFrozenPrompt(input) };
    if (mode === '--append-proposal-jsonl') return appendProposalJsonl(input);
    if (mode === '--verify-run-ledger-jsonl') return verifyRunLedgerJsonl(input.ledgerText ?? input.text ?? input);
    if (mode === '--aggregate-arm') return aggregateArm(input);
    return { ok: false, error: `unknown experiment harness mode: ${mode}` };
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
  const stdinText = mode === '--help' ? '' : fs.readFileSync(0, 'utf8');
  const result = runCli([mode], stdinText);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok === false ? 1 : 0; // exit() truncava stdout >64KiB em pipe (ver disproof-corpus-harness)
}

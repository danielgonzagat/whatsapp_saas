#!/usr/bin/env node
/**
 * humaneval-dispatch.mjs — despachante do HumanEval LIFT v1
 * (pré-registro: docs/evidence/darwin-godel-humaneval-v1.md, carimbo 8a6903b23).
 *
 * Papel: materializar despachos byte-determinísticos do dataset, coletar saídas
 * estruturadas dos propositores congelados, normalizar (regra pré-registrada),
 * montar samples JSONL e PREPARAR os insumos para o juiz engine-side
 * (scripts/mcp/atomic-edit/human-eval-lift-runner.mjs — consumido read-only,
 * por call-path). O despachante NUNCA executa testes; o juiz NUNCA chama modelo.
 *
 * Modos: --self-test | --build-g1 | --collect-g1 | --build-retry | --collect-retry | --assemble
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateProofFeedbackPackage } from '../atomic-edit/human-eval-lift-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const STATE_DIR = path.join(ROOT, '.atomic/evolution/humaneval-v1');
// Saídas ficam em work/ — o dataset (>1MB) fica FORA do effectRoot dos execs;
// no mesmo dir, o snapshot byte-effect do atomic_exec estoura o cap (recusa observada).
const WORK = path.join(STATE_DIR, 'work');
const DATASET = path.join(STATE_DIR, 'HumanEval.jsonl');
const G1_DIR = path.join(WORK, 'dispatch-g1');
const RETRY_DIR = path.join(WORK, 'dispatch-retry');
const ARMS_RETRY = Object.freeze(['cego', 'scalar', 'proof']);
const SCALAR_LINE = 'SUA TENTATIVA ANTERIOR FALHOU NOS TESTES.';

const sha256Text = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

/** Invólucro byte-idêntico entre braços e modelos (pré-registrado). */
export const WRAPPER = [
  'INVÓLUCRO DO EXPERIMENTO (byte-idêntico entre braços e modelos; não altera a tarefa):',
  'você responde dentro de um harness automatizado. Use APENAS a ferramenta StructuredOutput;',
  'não leia nenhum outro arquivo; não explore o repositório; não execute comandos.',
  'Responda com StructuredOutput({ codigoPython: <código Python puro, sem markdown> }).',
  'codigoPython deve ser SOMENTE a continuação (corpo, indentado com 4 espaços) do prompt',
  'Python da tarefa — OU a função completa começando em `def`. Nada de prosa fora de código.',
  '',
  '--- TAREFA ---',
  '',
].join('\n');
export const SUFFIX = '\n--- FIM DA TAREFA ---\n';
export const WRAPPER_SHA256 = sha256Text(WRAPPER + ' ' + SUFFIX);

function loadTasks() {
  const rows = fs
    .readFileSync(DATASET, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  if (rows.length !== 164) throw new Error(`dataset inesperado: ${rows.length} tarefas (esperava 164)`);
  return rows;
}

function safeId(taskId) {
  return taskId.replaceAll('/', '-');
}

function loadJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} ilegível (${file}): ${error.message}`);
  }
}

/**
 * Normalizador pré-registrado (determinístico, idêntico p/ braços e modelos):
 * 1) remove cercas markdown; 2) contém `def <entry>(` → "    pass\n\n" + texto;
 * 3) 1ª linha não-vazia sem indentação → indenta todas as não-vazias com 4 espaços;
 * 4) senão usa como veio. Sempre termina com \n.
 */
export function toCompletion(entryPoint, rawText) {
  let t = String(rawText ?? '');
  t = t.replace(/^\s*```[a-zA-Z]*[ \t]*\r?\n/, '').replace(/\r?\n```[ \t]*\s*$/, '');
  t = t.replace(/\s+$/, '');
  if (t.length === 0) return '    pass\n';
  const defRe = new RegExp(`(^|\\n)def\\s+${entryPoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);
  if (defRe.test(t)) return `    pass\n\n${t}\n`;
  const lines = t.split('\n');
  const first = lines.find((line) => line.trim().length > 0) ?? '';
  if (!/^\s/.test(first)) {
    return lines.map((line) => (line.trim().length ? `    ${line}` : line)).join('\n') + '\n';
  }
  return t + '\n';
}

function writeDispatch(dir, name, body) {
  fs.mkdirSync(dir, { recursive: true });
  const content = WRAPPER + body + SUFFIX;
  const file = path.join(dir, `${name}.txt`);
  fs.writeFileSync(file, content, 'utf8');
  return { file: path.relative(ROOT, file), dispatchedSha256: sha256Text(content) };
}

function cmdBuildG1() {
  const tasks = loadTasks();
  const entries = tasks.map((task) => ({
    task_id: task.task_id,
    entry_point: task.entry_point,
    ...writeDispatch(G1_DIR, safeId(task.task_id), task.prompt),
  }));
  const manifest = { kind: 'humaneval-g1-manifest', wrapperSha256: WRAPPER_SHA256, count: entries.length, entries };
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, 'manifest-g1.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { ok: true, count: entries.length, wrapperSha256: WRAPPER_SHA256 };
}

function collectInto({ proposalsFile, expectIds, label }) {
  const proposals = loadJson(proposalsFile, label);
  const list = Array.isArray(proposals) ? proposals : proposals.proposals;
  if (!Array.isArray(list)) throw new Error(`${label}: esperava array de propostas`);
  const byId = new Map();
  for (const item of list) {
    if (typeof item?.taskId !== 'string') throw new Error(`${label}: proposta sem taskId`);
    if (byId.has(item.taskId)) throw new Error(`${label}: taskId duplicado ${item.taskId}`);
    byId.set(item.taskId, item);
  }
  const missing = [];
  const infraFailed = [];
  for (const id of expectIds) {
    const got = byId.get(id);
    if (!got) missing.push(id);
    else if (got.infraOk !== true || typeof got.codigoPython !== 'string') infraFailed.push(id);
  }
  if (missing.length || infraFailed.length) {
    return { ok: false, missing, infraFailed, error: 'falhas de infraestrutura: re-despachar, não julgar' };
  }
  return { ok: true, byId };
}

function cmdCollectG1({ model, proposalsFile }) {
  if (!model || !proposalsFile) return { ok: false, error: 'exige {model, proposalsFile}' };
  const tasks = loadTasks();
  const got = collectInto({ proposalsFile, expectIds: tasks.map((t) => t.task_id), label: 'g1' });
  if (got.ok !== true) return got;
  const rows = tasks.map((task) => ({
    task_id: task.task_id,
    arm: 'baseline',
    model_id: model,
    attempt_budget: 1,
    completion: toCompletion(task.entry_point, got.byId.get(task.task_id).codigoPython),
  }));
  const out = path.join(WORK, `samples-${model}-baseline.jsonl`);
  fs.writeFileSync(out, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  return { ok: true, model, rows: rows.length, file: path.relative(ROOT, out) };
}

function cmdBuildRetry({ repairPromptsFile }) {
  if (!repairPromptsFile) return { ok: false, error: 'exige {repairPromptsFile} (saída --emit-repair-prompts --json do runner)' };
  const tasks = new Map(loadTasks().map((task) => [task.task_id, task]));
  const repair = loadJson(repairPromptsFile, 'repair-prompts');
  if (repair.ok !== true || !Array.isArray(repair.prompts)) return { ok: false, error: 'repair-prompts inválido (ok!==true)' };
  const failures = repair.prompts.map((p) => p.task_id);
  const entries = [];
  for (const prompt of repair.prompts) {
    const task = tasks.get(prompt.task_id);
    if (!task) return { ok: false, error: `tarefa desconhecida no repair: ${prompt.task_id}` };
    entries.push({
      task_id: task.task_id,
      proof: writeDispatch(RETRY_DIR, `proof-${safeId(task.task_id)}`, prompt.repair_prompt),
      scalar: writeDispatch(RETRY_DIR, `scalar-${safeId(task.task_id)}`, `${task.prompt}\n${SCALAR_LINE}\n`),
      cego: writeDispatch(RETRY_DIR, `cego-${safeId(task.task_id)}`, task.prompt),
    });
  }
  const manifest = {
    kind: 'humaneval-retry-manifest',
    wrapperSha256: WRAPPER_SHA256,
    repairPromptsSha256: sha256Text(fs.readFileSync(path.resolve(repairPromptsFile), 'utf8')),
    failures,
    count: entries.length,
    entries,
  };
  fs.writeFileSync(path.join(WORK, 'manifest-retry.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { ok: true, failures: failures.length, wrapperSha256: WRAPPER_SHA256, failuresList: failures };
}

function cmdCollectRetry({ arm, proposalsFile }) {
  if (!ARMS_RETRY.includes(arm) || !proposalsFile) return { ok: false, error: 'exige {arm∈cego|scalar|proof, proposalsFile}' };
  const manifest = loadJson(path.join(WORK, 'manifest-retry.json'), 'manifest-retry');
  const tasks = new Map(loadTasks().map((task) => [task.task_id, task]));
  const got = collectInto({ proposalsFile, expectIds: manifest.failures, label: `retry-${arm}` });
  if (got.ok !== true) return got;
  const rows = manifest.failures.map((taskId) => ({
    task_id: taskId,
    completion: toCompletion(tasks.get(taskId).entry_point, got.byId.get(taskId).codigoPython),
  }));
  const out = path.join(WORK, `retry-${arm}.jsonl`);
  fs.writeFileSync(out, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  return { ok: true, arm, rows: rows.length, file: path.relative(ROOT, out) };
}

function cmdAssemble({ model, packagesFile, repairPromptsFile }) {
  if (!model || !packagesFile || !repairPromptsFile) {
    return { ok: false, error: 'exige {model, packagesFile, repairPromptsFile}' };
  }
  const baseline = fs
    .readFileSync(path.join(WORK, `samples-${model}-baseline.jsonl`), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  const packagesReport = loadJson(packagesFile, 'packages');
  const repairReport = loadJson(repairPromptsFile, 'repair-prompts');
  if (packagesReport.ok !== true || repairReport.ok !== true) return { ok: false, error: 'packages/repair-prompts com ok!==true' };
  const packagesByTask = new Map(packagesReport.packages.map((entry) => [entry.task_id, entry]));
  const promptShaByTask = new Map(repairReport.prompts.map((entry) => [entry.task_id, entry.repair_prompt_sha256]));
  const receiptSha = sha256Text(fs.readFileSync(path.resolve(repairPromptsFile), 'utf8'));
  const failures = new Set(packagesReport.packages.map((entry) => entry.task_id));
  const retried = {};
  for (const arm of ARMS_RETRY) {
    retried[arm] = new Map(
      fs
        .readFileSync(path.join(WORK, `retry-${arm}.jsonl`), 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
        .map((row) => [row.task_id, row.completion]),
    );
  }
  const rows = [...baseline];
  const invalidPackages = [];
  for (const base of baseline) {
    for (const arm of ARMS_RETRY) {
      if (!failures.has(base.task_id)) {
        rows.push({ task_id: base.task_id, arm, model_id: model, attempt_budget: 2, feedback_source: 'none', completion: base.completion });
        continue;
      }
      const completion = retried[arm].get(base.task_id);
      if (typeof completion !== 'string') return { ok: false, error: `retry ${arm} sem completion para ${base.task_id}` };
      const row = { task_id: base.task_id, arm, model_id: model, attempt_budget: 2, completion };
      if (arm === 'proof') {
        const pkg = packagesByTask.get(base.task_id);
        row.feedback_source = 'atomic-proof-feedback';
        row.proof_feedback_package = pkg.proof_feedback_package;
        row.proof_feedback_package_sha256 = pkg.proof_feedback_package_sha256;
        row.repair_prompt_sha256 = promptShaByTask.get(base.task_id) ?? null;
        row.atomic_receipt_sha256 = receiptSha;
        const check = validateProofFeedbackPackage(row);
        if (check.ok !== true) invalidPackages.push({ task_id: base.task_id, reason: check.reason });
      } else {
        row.feedback_source = 'none';
      }
      rows.push(row);
    }
  }
  if (invalidPackages.length) return { ok: false, error: 'pacotes proof inválidos', invalidPackages };
  const out = path.join(WORK, `samples-${model}-lift.jsonl`);
  fs.writeFileSync(out, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  return {
    ok: true,
    model,
    rows: rows.length,
    failures: failures.size,
    atomicReceiptSha256: receiptSha,
    file: path.relative(ROOT, out),
  };
}

function cmdSelfTest() {
  const checks = [];
  checks.push(['fence+def', toCompletion('add', '```python\ndef add(a, b):\n    return a + b\n```') === '    pass\n\ndef add(a, b):\n    return a + b\n']);
  checks.push(['corpo plano', toCompletion('add', 'return a + b') === '    return a + b\n']);
  checks.push(['corpo indentado', toCompletion('add', '    return a + b') === '    return a + b\n']);
  checks.push(['vazio vira pass', toCompletion('add', '') === '    pass\n']);
  checks.push([
    'corpo plano aninhado preserva relativo',
    toCompletion('f', 'total = 0\nfor x in xs:\n    total += x\nreturn total') ===
      '    total = 0\n    for x in xs:\n        total += x\n    return total\n',
  ]);
  const pkg = {
    version: 'atomic-proof-feedback-v1',
    task_id: 'T/1',
    invariantId: 'humaneval.assertion',
    counterexample: 'def check(candidate): assert candidate(1) == 2',
    lessonLine: 'lição',
    proposalDigest: 'a'.repeat(64),
  };
  const canonical = (value) =>
    Array.isArray(value)
      ? `[${value.map(canonical).join(',')}]`
      : value && typeof value === 'object'
        ? `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
            .join(',')}}`
        : JSON.stringify(value);
  const goodRow = {
    task_id: 'T/1',
    arm: 'proof',
    feedback_source: 'atomic-proof-feedback',
    proof_feedback_package: pkg,
    proof_feedback_package_sha256: sha256Text(canonical(pkg)),
  };
  checks.push(['pacote válido aceito pelo runner (call-path engine)', validateProofFeedbackPackage(goodRow).ok === true]);
  checks.push([
    'forja de digest recusada pelo runner',
    validateProofFeedbackPackage({ ...goodRow, proof_feedback_package_sha256: 'f'.repeat(64) }).ok === false,
  ]);
  checks.push(['passthrough proof com feedback_source none é aceito', validateProofFeedbackPackage({ task_id: 'T/1', arm: 'proof', feedback_source: 'none' }).ok === true]);
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return failed.length === 0 ? { ok: true, checks: checks.length } : { ok: false, failed };
}

export function runCli(argv, stdinText) {
  const mode = argv[0] ?? '--help';
  try {
    if (mode === '--help') {
      return { ok: true, modes: ['--help', '--self-test', '--build-g1', '--collect-g1', '--build-retry', '--collect-retry', '--assemble'], wrapperSha256: WRAPPER_SHA256 };
    }
    if (mode === '--self-test') return cmdSelfTest();
    const trimmed = String(stdinText ?? '').trim();
    const input = trimmed.length === 0 ? {} : JSON.parse(trimmed);
    if (mode === '--build-g1') return cmdBuildG1(input);
    if (mode === '--collect-g1') return cmdCollectG1(input);
    if (mode === '--build-retry') return cmdBuildRetry(input);
    if (mode === '--collect-retry') return cmdCollectRetry(input);
    if (mode === '--assemble') return cmdAssemble(input);
    return { ok: false, error: `modo desconhecido: ${mode}` };
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
  const needsInput = !['--help', '--self-test', '--build-g1'].includes(mode);
  const stdinText = needsInput ? fs.readFileSync(0, 'utf8') : '';
  const result = runCli([mode], stdinText);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok === false ? 1 : 0);
}
